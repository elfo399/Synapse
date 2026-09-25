"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Core, Css, StylesheetJson } from "cytoscape";
import type { ItemType } from "@/domain/types";
import {
  graphColors,
  nodeColors,
  type GraphControls,
  type GraphCanvasProps,
} from "./shared";

const shapes: Record<ItemType, Css.NodeShape> = {
  PROJECT: "round-rectangle",
  AREA: "hexagon",
  RESOURCE: "diamond",
  TASK: "rectangle",
  BOOKMARK: "pentagon",
};
const layoutOptions = (count: number) => ({
  name: "cose",
  animate: false,
  randomize: true,
  padding: 75,
  nodeDimensionsIncludeLabels: true,
  nodeRepulsion: () => 24000,
  idealEdgeLength: () => 145,
  nodeOverlap: 24,
  componentSpacing: 170,
  gravity: 0.12,
  numIter: count > 500 ? 180 : 650,
});

function readableLabels(cy: Core) {
  const zoom = cy.zoom();
  const priority = (node: ReturnType<Core["nodes"]>[number]) =>
    node.selected()
      ? 100000
      : node.hasClass("hover")
        ? 90000
        : (node.hasClass("neighbor") ? 10000 : 0) + node.degree();
  const occupied: { x1: number; x2: number; y1: number; y2: number }[] = [];
  cy.batch(() => {
    cy.nodes().style({
      "font-size": 12 / zoom,
      "text-max-width": 160 / zoom,
      "text-margin-y": 8 / zoom,
      "text-background-padding": 3 / zoom,
      "text-opacity": 1,
    });
    for (const node of cy
      .nodes()
      .toArray()
      .sort((a, b) => priority(b) - priority(a))) {
      const bounds = node.renderedBoundingBox({
        includeNodes: false,
        includeEdges: false,
        includeLabels: true,
      });
      const outside =
        bounds.x1 < 5 ||
        bounds.x2 > cy.width() - 5 ||
        bounds.y1 < 45 ||
        bounds.y2 > cy.height() - 70;
      const collision = occupied.some(
        (other) =>
          bounds.x1 < other.x2 + 4 &&
          bounds.x2 + 4 > other.x1 &&
          bounds.y1 < other.y2 + 4 &&
          bounds.y2 + 4 > other.y1,
      );
      if (outside || collision) node.style("text-opacity", 0);
      else occupied.push(bounds);
    }
  });
}

function selectNeighborhood(cy: Core, id: string | null) {
  cy.batch(() => {
    cy.elements().removeClass("connected dimmed neighbor");
    cy.nodes().unselect();
    if (!id) return;
    const node = cy.getElementById(id);
    if (!node.length) return;
    node.select();
    node.neighborhood().nodes().addClass("neighbor");
    node.connectedEdges().addClass("connected");
    cy.elements().not(node.closedNeighborhood()).addClass("dimmed");
  });
  readableLabels(cy);
}

export const GraphCanvas = forwardRef<GraphControls, GraphCanvasProps>(
  function GraphCanvas({ data, selected, onSelect, onOpen }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const instance = useRef<Core | null>(null);
    const selectedRef = useRef(selected);
    useEffect(() => {
      selectedRef.current = selected;
    }, [selected]);
    const handlers = useRef({ onSelect, onOpen });
    useEffect(() => {
      handlers.current = { onSelect, onOpen };
    }, [onSelect, onOpen]);
    useImperativeHandle(
      ref,
      () => ({
        fit: () => {
          instance.current?.fit(undefined, 75);
        },
        zoom: (factor) => {
          const cy = instance.current;
          if (cy)
            cy.zoom({
              level: cy.zoom() * factor,
              renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
            });
        },
        reset: () => {
          instance.current?.layout(layoutOptions(data.nodes.length)).run();
        },
      }),
      [data.nodes.length],
    );
    useEffect(() => {
      let stopped = false;
      let observer: ResizeObserver | undefined;
      void import("cytoscape").then(({ default: cytoscape }) => {
        if (stopped || !container.current) return;
        const style: StylesheetJson = [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "background-color": "data(color)",
              shape: (node) => shapes[node.data("type") as ItemType],
              width: "data(size)",
              height: "data(size)",
              "border-width": 3,
              "border-color": graphColors.background,
              color: graphColors.text,
              "font-family": "system-ui, sans-serif",
              "font-size": 13,
              "font-weight": 400,
              "text-valign": "bottom",
              "text-margin-y": 9,
              "text-wrap": "wrap",
              "text-max-width": "170px",
              "min-zoomed-font-size": 9,
              "text-background-color": graphColors.background,
              "text-background-opacity": 0.9,
              "text-background-padding": "3px",
            },
          },
          {
            selector: "edge",
            style: {
              width: 1.1,
              "line-color": graphColors.edge,
              "target-arrow-color": graphColors.edge,
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.5,
              "curve-style": "straight",
              opacity: 0.48,
            },
          },
          {
            selector: "node:selected",
            style: {
              "border-color": graphColors.accent,
              "border-width": 3,
              "overlay-color": graphColors.accent,
              "overlay-opacity": 0.1,
              "overlay-padding": 8,
              color: graphColors.textBright,
              "font-weight": 600,
            },
          },
          {
            selector: "node.hover",
            style: {
              "border-color": graphColors.muted,
              "border-width": 2,
              color: graphColors.textBright,
            },
          },
          {
            selector: "node.neighbor",
            style: {
              color: graphColors.textBright,
              "border-color": graphColors.border,
              "border-width": 2,
            },
          },
          {
            selector: "edge.connected",
            style: {
              "line-color": graphColors.accent,
              "target-arrow-color": graphColors.accent,
              opacity: 0.85,
              width: 1.8,
            },
          },
          { selector: ".dimmed", style: { opacity: 0.2 } },
          {
            selector: "node.archived",
            style: { "background-opacity": 0.5, "border-style": "dashed" },
          },
        ];
        const cy = cytoscape({
          container: container.current,
          style,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          minZoom: 0.1,
          maxZoom: 3,
          wheelSensitivity: 0.2,
          elements: [
            ...data.nodes.map((node) => ({
              data: {
                id: node.id,
                type: node.type,
                label:
                  node.title.length > 38
                    ? node.title.slice(0, 37) + "…"
                    : node.title,
                color: nodeColors[node.type],
                size: Math.min(30, 13 + Math.sqrt(node.connections) * 3),
              },
              classes: node.archivedAt ? "archived" : "",
            })),
            ...data.edges.map((edge) => ({
              data: { id: edge.id, source: edge.source, target: edge.target },
            })),
          ],
          layout: layoutOptions(data.nodes.length),
        });
        instance.current = cy;
        selectNeighborhood(cy, selectedRef.current);
        cy.on("tap", "node", (event) =>
          handlers.current.onSelect(event.target.id()),
        );
        cy.on("dbltap", "node", (event) =>
          handlers.current.onOpen(event.target.id()),
        );
        cy.on("mouseover", "node", (event) => {
          event.target.addClass("hover");
          readableLabels(cy);
          if (container.current) container.current.style.cursor = "pointer";
        });
        cy.on("mouseout", "node", (event) => {
          event.target.removeClass("hover");
          readableLabels(cy);
          if (container.current) container.current.style.cursor = "grab";
        });
        cy.on("viewport layoutstop", () => readableLabels(cy));
        observer = new ResizeObserver(() => {
          cy.resize();
          cy.fit(undefined, 75);
        });
        observer.observe(container.current);
      });
      return () => {
        stopped = true;
        observer?.disconnect();
        instance.current?.destroy();
        instance.current = null;
      };
    }, [data]);
    useEffect(() => {
      if (instance.current) selectNeighborhood(instance.current, selected);
    }, [selected, data]);
    return (
      <div
        ref={container}
        className="graph-canvas"
        role="img"
        aria-label={`Grafo delle conoscenze con ${data.nodes.length} elementi. Usa l’elenco dei nodi per selezionarli con la tastiera.`}
        data-testid="graph-canvas"
        data-mode="2d"
      />
    );
  },
);
