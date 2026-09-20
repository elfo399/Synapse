"use client";

import {
  Component,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  Spherical,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode } from "@/domain/graph";
import {
  graphColors,
  nodeColors,
  type GraphCanvasProps,
  type GraphControls,
} from "@/components/graph/shared";

type NodeVisual = {
  group: Group;
  body: Mesh<BufferGeometry, MeshLambertMaterial>;
  halo: Mesh<BufferGeometry, MeshBasicMaterial>;
  label?: SpriteText;
  labelScale?: Vector3;
  radius: number;
};
type SceneNode = GraphNode & { visual?: NodeVisual };
type SceneLink = { id: string };
type GraphInstance = ForceGraphMethods<SceneNode, SceneLink>;

function labelFor(node: GraphNode, radius: number) {
  // SpriteText paints onto a canvas: user titles are never interpreted as HTML.
  const label = new SpriteText(
    node.title.length > 34 ? `${node.title.slice(0, 33)}…` : node.title,
    6.2,
    graphColors.text,
  );
  label.fontFace = "system-ui, sans-serif";
  label.fontWeight = "500";
  label.backgroundColor = graphColors.labelBackground;
  label.padding = [2, 4];
  label.borderRadius = 3;
  label.position.y = -radius - 4;
  label.material.depthWrite = false;
  return label;
}

function shapeFor(node: GraphNode, radius: number): BufferGeometry {
  switch (node.type) {
    case "NOTE":
      return new SphereGeometry(radius, 14, 10);
    case "PROJECT":
      return new BoxGeometry(radius * 1.65, radius * 1.65, radius * 1.65);
    case "AREA":
      return new CylinderGeometry(radius, radius, radius * 1.5, 6);
    case "RESOURCE":
      return new OctahedronGeometry(radius * 1.2);
    case "TASK":
      return new BoxGeometry(radius * 1.8, radius * 1.3, radius * 1.1);
    case "BOOKMARK":
      return new DodecahedronGeometry(radius);
  }
}

function highlight(
  node: SceneNode,
  selected: string | null,
  hovered: string | null,
  showLabels: boolean,
  neighborhood: Set<string>,
) {
  const visual = node.visual;
  if (!visual) return;
  const active = node.id === selected;
  const hover = node.id === hovered;
  const dimmed = Boolean(
    selected && !active && !neighborhood.has(node.id) && !hover,
  );
  visual.halo.visible = active || hover;
  visual.halo.material.opacity = active ? 0.55 : 0.24;
  visual.body.material.emissive.set(
    active
      ? graphColors.emissive
      : hover
        ? graphColors.hover
        : graphColors.black,
  );
  visual.body.material.opacity = dimmed ? 0.2 : node.archivedAt ? 0.45 : 0.96;
  visual.body.scale.setScalar(active ? 1.15 : hover ? 1.08 : 1);
  const showLabel = showLabels || active || hover || neighborhood.has(node.id);
  if (showLabel && !visual.label) {
    visual.label = labelFor(node, visual.radius);
    visual.labelScale = visual.label.scale.clone();
    visual.group.add(visual.label);
  }
  if (visual.label) {
    visual.label.visible = showLabel;
    visual.label.material.opacity = dimmed ? 0.27 : 1;
    const color =
      active || neighborhood.has(node.id)
        ? graphColors.textBright
        : graphColors.text;
    if (visual.label.color !== color) visual.label.color = color;
  }
}

function sizeVisuals(
  nodes: NodeObject<SceneNode>[],
  instance: GraphInstance,
  width: number,
  height: number,
  selected: string | null,
  hovered: string | null,
  neighborhood: Set<string>,
) {
  const camera = instance.camera() as PerspectiveCamera;
  const direction = camera.getWorldDirection(new Vector3());
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const unitsPerPixel =
    (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, height);
  const offset = new Vector3();
  type Bounds = { left: number; right: number; top: number; bottom: number };
  const occupied: Bounds[] = [];
  const priority = (node: SceneNode) =>
    node.id === selected
      ? 100000
      : node.id === hovered
        ? 90000
        : (neighborhood.has(node.id) ? 10000 : 0) + node.connections;
  // Place captions in screen space: perspective and orbiting can make distant
  // nodes overlap even when the force layout keeps their world positions apart.
  for (const node of [...nodes].sort((a, b) => priority(b) - priority(a))) {
    const visual = node.visual;
    if (!visual) continue;
    const position = new Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0);
    const depth = Math.max(
      1,
      offset.copy(position).sub(camera.position).dot(direction),
    );
    const scale =
      nodes.length <= 100
        ? Math.min(
            4,
            Math.max(
              1,
              (depth *
                unitsPerPixel *
                Math.min(8, 5 + Math.sqrt(node.connections) * 0.35)) /
                visual.radius,
            ),
          )
        : 1;
    visual.group.scale.setScalar(scale);
    if (visual.label && visual.labelScale) {
      const label = visual.label;
      const textPixels = width < 500 ? 11 : 12;
      label.scale
        .copy(visual.labelScale)
        .multiplyScalar((depth * unitsPerPixel * textPixels) / (6.2 * scale));
      const projected = position.project(camera);
      const x = ((projected.x + 1) * width) / 2;
      const y = ((1 - projected.y) * height) / 2;
      const labelWidth = (visual.labelScale.x * textPixels) / 6.2;
      const labelHeight = (visual.labelScale.y * textPixels) / 6.2;
      const eligible =
        nodes.length <= 100 ||
        node.id === selected ||
        node.id === hovered ||
        neighborhood.has(node.id);
      label.visible = false;
      if (
        !eligible ||
        projected.z > 1 ||
        projected.z < -1 ||
        x < 0 ||
        x > width ||
        y < 0 ||
        y > height
      )
        continue;
      const centerX = Math.max(
        labelWidth / 2 + 8,
        Math.min(width - labelWidth / 2 - 8, x),
      );
      for (const displacement of [22, -22, 42, -42, 62, -62]) {
        const centerY = y + displacement;
        const bounds = {
          left: centerX - labelWidth / 2 - 3,
          right: centerX + labelWidth / 2 + 3,
          top: centerY - labelHeight / 2 - 2,
          bottom: centerY + labelHeight / 2 + 2,
        };
        if (bounds.top < 48 || bounds.bottom > height - 72) continue;
        if (
          occupied.some(
            (other) =>
              bounds.left < other.right &&
              bounds.right > other.left &&
              bounds.top < other.bottom &&
              bounds.bottom > other.top,
          )
        )
          continue;
        occupied.push(bounds);
        label.position
          .copy(right)
          .multiplyScalar(((centerX - x) * depth * unitsPerPixel) / scale)
          .addScaledVector(
            up,
            (-(centerY - y) * depth * unitsPerPixel) / scale,
          );
        label.visible = true;
        break;
      }
    }
  }
}

function escapedTitle(node: GraphNode) {
  return node.title.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

function endpointId(endpoint: LinkObject<SceneNode, SceneLink>["source"]) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

class WebGLBoundary extends Component<
  { children: ReactNode; onUnavailable?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onUnavailable?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// GraphView loads this module with ssr:false: the WebGL dependency requires a browser.
export const GraphCanvas3D = forwardRef<GraphControls, GraphCanvasProps>(
  function GraphCanvas3D(props, ref) {
    return (
      <WebGLBoundary onUnavailable={props.onUnavailable}>
        <GraphScene {...props} ref={ref} />
      </WebGLBoundary>
    );
  },
);

const GraphScene = forwardRef<GraphControls, GraphCanvasProps>(
  function GraphScene(
    { data, selected, onSelect, onOpen, onUnavailable },
    ref,
  ) {
    const container = useRef<HTMLDivElement>(null);
    const graph = useRef<GraphInstance | undefined>(undefined);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [hovered, setHovered] = useState<string | null>(null);
    const [reducedMotion, setReducedMotion] = useState(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    const selectedRef = useRef(selected);
    const hoveredRef = useRef(hovered);
    const neighborhood = useMemo(
      () =>
        new Set(
          data.edges.flatMap((edge) =>
            edge.source === selected
              ? [edge.target]
              : edge.target === selected
                ? [edge.source]
                : [],
          ),
        ),
      [data, selected],
    );
    const neighborhoodRef = useRef(neighborhood);
    const fitRequested = useRef(true);
    const lastClick = useRef<{ id: string; at: number } | null>(null);
    const initialOrientation = useRef(true);
    const showLabels = data.nodes.length <= 100;
    // The simulation writes positions and resolves link endpoints in place. Never pass API/cache objects to it.
    const graphData = useMemo(
      () => ({
        nodes: data.nodes.map(
          (node, index) =>
            ({
              ...node,
              tags: [...node.tags],
              x: Math.cos(index * 2.39996) * Math.sqrt(index + 1) * 42,
              y: Math.sin(index * 2.39996) * Math.sqrt(index + 1) * 42,
              z: ((index % 5) - 2) * 22,
            }) as NodeObject<SceneNode>,
        ),
        links: data.edges.map(
          (edge) => ({ ...edge }) as LinkObject<SceneNode, SceneLink>,
        ),
      }),
      [data],
    );

    useEffect(() => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReducedMotion(media.matches);
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }, []);

    useEffect(() => {
      const element = container.current;
      if (!element) return;
      const observer = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        setSize((previous) =>
          previous.width === Math.floor(width) &&
          previous.height === Math.floor(height)
            ? previous
            : {
                width: Math.max(1, Math.floor(width)),
                height: Math.max(1, Math.floor(height)),
              },
        );
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      selectedRef.current = selected;
      hoveredRef.current = hovered;
      neighborhoodRef.current = neighborhood;
      graphData.nodes.forEach((node) =>
        highlight(node, selected, hovered, showLabels, neighborhood),
      );
      if (graph.current)
        sizeVisuals(
          graphData.nodes,
          graph.current,
          size.width,
          size.height,
          selected,
          hovered,
          neighborhood,
        );
    }, [
      selected,
      hovered,
      graphData,
      showLabels,
      size.width,
      size.height,
      neighborhood,
    ]);

    useEffect(() => {
      fitRequested.current = true;
      if (container.current) container.current.dataset.settled = "false";
      // three-forcegraph owns the scene objects, including their label textures. Its data
      // removal/unmount lifecycle recursively disposes geometries, materials and textures.
    }, [graphData]);

    const makeNode = useCallback(
      (node: NodeObject<SceneNode>) => {
        const radius = Math.min(7.4, 4.4 + Math.sqrt(node.connections) * 0.7);
        const group = new Group();
        const body = new Mesh(
          shapeFor(node, radius),
          new MeshLambertMaterial({
            color: nodeColors[node.type],
            transparent: true,
            opacity: node.archivedAt ? 0.42 : 0.96,
          }),
        );
        const halo = new Mesh(
          new SphereGeometry(radius * 1.55, 14, 10),
          new MeshBasicMaterial({
            color: graphColors.accent,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          }),
        );
        group.add(body, halo);
        node.visual = { group, body, halo, radius };
        highlight(
          node,
          selectedRef.current,
          hoveredRef.current,
          showLabels,
          neighborhoodRef.current,
        );
        return group;
      },
      [showLabels],
    );

    const fit = useCallback(() => {
      const instance = graph.current;
      if (!instance || !graphData.nodes.length || !size.width || !size.height)
        return;
      const camera = instance.camera() as PerspectiveCamera;
      const controls = instance.controls() as OrbitControls;
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      const right = new Vector3()
        .crossVectors(camera.up, direction)
        .normalize();
      const up = new Vector3().crossVectors(direction, right).normalize();
      const positions = graphData.nodes.map(
        (node) => new Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0),
      );
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      positions.forEach((position) => {
        min.min(position);
        max.max(position);
      });
      const center = min.add(max).multiplyScalar(0.5);
      const verticalFov = Math.tan((camera.fov * Math.PI) / 360);
      const horizontalFov = verticalFov * camera.aspect;
      const horizontalRoom = Math.max(
        0.3,
        1 - (size.width < 500 ? 100 : 160) / size.width,
      );
      const verticalRoom = Math.max(0.35, 1 - 115 / size.height);
      let distance = 80;
      // Fit the actual points in camera space. The library's world-axis cube fit
      // overestimates a diagonal graph's depth, especially in portrait viewports.
      positions.forEach((position) => {
        const relative = position.sub(center);
        const depth = relative.dot(direction);
        distance = Math.max(
          distance,
          depth +
            (Math.abs(relative.dot(right)) + 8) /
              (horizontalFov * horizontalRoom),
          depth +
            (Math.abs(relative.dot(up)) + 8) / (verticalFov * verticalRoom),
        );
      });
      instance.cameraPosition(
        center.clone().add(direction.multiplyScalar(distance)),
        center,
        reducedMotion ? 0 : 260,
      );
    }, [graphData, size.width, size.height, reducedMotion]);

    // Inspector, fullscreen and mobile layout changes all resize the actual canvas.
    // Refit settled nodes to that space so the inspector never obscures a neighborhood.
    useEffect(() => {
      if (container.current?.dataset.settled === "true") fit();
    }, [fit]);

    useImperativeHandle(
      ref,
      () => ({
        fit,
        zoom(factor) {
          const instance = graph.current;
          if (!instance || !Number.isFinite(factor) || factor <= 0) return;
          const controls = instance.controls() as OrbitControls;
          const offset = instance
            .camera()
            .position.clone()
            .sub(controls.target);
          const distance = Math.min(
            controls.maxDistance,
            Math.max(controls.minDistance, offset.length() / factor),
          );
          instance.cameraPosition(
            controls.target.clone().add(offset.setLength(distance)),
            controls.target,
            reducedMotion ? 0 : 160,
          );
        },
        reset() {
          const instance = graph.current;
          if (!instance) return;
          const box = instance.getGraphBbox();
          const center = box
            ? new Vector3(
                (box.x[0] + box.x[1]) / 2,
                (box.y[0] + box.y[1]) / 2,
                (box.z[0] + box.z[1]) / 2,
              )
            : new Vector3();
          instance.cameraPosition(
            center.clone().add(new Vector3(90, 45, 400)),
            center,
            0,
          );
          fit();
        },
        rotate(axis, angle) {
          const instance = graph.current;
          if (!instance) return;
          const controls = instance.controls() as OrbitControls;
          const spherical = new Spherical().setFromVector3(
            instance.camera().position.clone().sub(controls.target),
          );
          if (axis === "horizontal") spherical.theta += angle;
          else
            spherical.phi = Math.max(
              0.08,
              Math.min(Math.PI - 0.08, spherical.phi + angle),
            );
          instance.cameraPosition(
            controls.target
              .clone()
              .add(new Vector3().setFromSpherical(spherical)),
            controls.target,
            reducedMotion ? 0 : 160,
          );
        },
      }),
      [fit, reducedMotion],
    );

    useEffect(() => {
      const instance = graph.current;
      const element = container.current;
      if (!instance || !element || !size.width) return;
      const controls = instance.controls() as OrbitControls;
      controls.enableDamping = !reducedMotion;
      controls.dampingFactor = 0.12;
      controls.rotateSpeed = 0.7;
      controls.zoomSpeed = 0.8;
      controls.minDistance = 25;
      controls.maxDistance = 8000;
      controls.autoRotate = false;
      instance
        .renderer()
        .setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const updateCamera = () => {
        element.dataset.cameraPosition = instance
          .camera()
          .position.toArray()
          .map((value) => value.toFixed(2))
          .join(",");
        sizeVisuals(
          graphData.nodes,
          instance,
          size.width,
          size.height,
          selectedRef.current,
          hoveredRef.current,
          neighborhoodRef.current,
        );
      };
      const startInteraction = () => {
        fitRequested.current = false;
      };
      const lostContext = (event: Event) => {
        event.preventDefault();
        onUnavailable?.();
      };
      const canvas = instance.renderer().domElement;
      controls.addEventListener("change", updateCamera);
      controls.addEventListener("start", startInteraction);
      canvas.addEventListener("webglcontextlost", lostContext);
      if (initialOrientation.current) {
        initialOrientation.current = false;
        instance.cameraPosition(
          { x: 90, y: 45, z: 400 },
          { x: 0, y: 0, z: 0 },
          0,
        );
        instance.d3Force("charge")?.strength(-250).distanceMin(28);
        instance.d3Force("link")?.distance(115);
      }
      element.dataset.ready = "true";
      updateCamera();
      return () => {
        controls.removeEventListener("change", updateCamera);
        controls.removeEventListener("start", startInteraction);
        canvas.removeEventListener("webglcontextlost", lostContext);
      };
    }, [graphData, size.width, size.height, reducedMotion, onUnavailable]);

    const linkColor = useCallback(
      (link: LinkObject<SceneNode, SceneLink>) =>
        selected
          ? endpointId(link.source) === selected ||
            endpointId(link.target) === selected
            ? graphColors.accent
            : graphColors.edgeDim
          : graphColors.edge,
      [selected],
    );
    const linkWidth = useCallback(
      (link: LinkObject<SceneNode, SceneLink>) =>
        selected &&
        (endpointId(link.source) === selected ||
          endpointId(link.target) === selected)
          ? 1
          : 0.4,
      [selected],
    );

    return (
      <div
        ref={container}
        className="graph-canvas"
        role="img"
        aria-label={`Grafo 3D delle conoscenze con ${data.nodes.length} elementi. Trascina per ruotare, usa la rotella per lo zoom oppure i comandi di rotazione e l’elenco dei nodi.`}
        data-testid="graph-canvas"
        data-mode="3d"
      >
        {size.width > 0 && (
          <ForceGraph3D<SceneNode, SceneLink>
            ref={graph}
            width={size.width}
            height={size.height}
            graphData={graphData}
            numDimensions={3}
            controlType="orbit"
            backgroundColor={graphColors.background}
            showNavInfo={false}
            nodeThreeObject={makeNode}
            nodeLabel={escapedTitle}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkOpacity={0.65}
            linkDirectionalArrowLength={1.9}
            linkDirectionalArrowRelPos={0.86}
            linkDirectionalArrowResolution={4}
            enableNodeDrag={false}
            warmupTicks={reducedMotion ? 150 : 70}
            cooldownTicks={reducedMotion ? 0 : 100}
            cooldownTime={3500}
            d3AlphaDecay={0.045}
            d3VelocityDecay={0.35}
            onEngineStop={() => {
              if (container.current) container.current.dataset.settled = "true";
              if (fitRequested.current) {
                fitRequested.current = false;
                fit();
              }
            }}
            onNodeHover={(node) => {
              setHovered(node?.id ?? null);
              if (container.current)
                container.current.style.cursor = node ? "pointer" : "grab";
            }}
            onNodeClick={(node) => {
              onSelect(node.id);
              const now = performance.now();
              if (
                lastClick.current?.id === node.id &&
                now - lastClick.current.at < 350
              ) {
                lastClick.current = null;
                onOpen(node.id);
              } else lastClick.current = { id: node.id, at: now };
            }}
          />
        )}
      </div>
    );
  },
);
