"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Core, Css, StylesheetJson } from "cytoscape";
import type { ItemType } from "@/domain/types";
import { nodeColors, type GraphControls, type GraphCanvasProps } from "./shared";

const shapes: Record<ItemType, Css.NodeShape> = { NOTE: "ellipse", PROJECT: "round-rectangle", AREA: "hexagon", RESOURCE: "diamond", TASK: "rectangle", BOOKMARK: "pentagon" };

export const GraphCanvas = forwardRef<GraphControls, GraphCanvasProps>(function GraphCanvas({ data, selected, onSelect, onOpen }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Core | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const handlers = useRef({ onSelect, onOpen });
  useEffect(() => { handlers.current = { onSelect, onOpen }; }, [onSelect, onOpen]);
  useImperativeHandle(ref, () => ({
    fit: () => { instance.current?.fit(undefined, 70); },
    zoom: factor => { const cy = instance.current; if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); },
    reset: () => { instance.current?.layout({ name: "cose", animate: false, randomize: true, padding: 70, nodeRepulsion: () => 14000, idealEdgeLength: () => 100, numIter: data.nodes.length > 500 ? 120 : 400 }).run(); },
  }), [data.nodes.length]);
  useEffect(() => {
    let stopped = false;
    let observer: ResizeObserver | undefined;
    void import("cytoscape").then(({ default: cytoscape }) => {
      if (stopped || !container.current) return;
      const style: StylesheetJson = [
        { selector: "node", style: {
          label: "data(label)", "background-color": "data(color)", shape: node => shapes[node.data("type") as ItemType], width: "data(size)", height: "data(size)",
          "border-width": 4, "border-color": "#171d25", "border-opacity": 1,
          color: "#c6ceda", "font-family": "system-ui, sans-serif", "font-size": 11, "font-weight": 500,
          "text-valign": "bottom", "text-margin-y": 10, "text-wrap": "wrap", "text-max-width": "140px", "min-zoomed-font-size": 7,
          "text-background-color": "#12171e", "text-background-opacity": .85, "text-background-padding": "3px",
        } },
        { selector: "edge", style: { width: 1.2, "line-color": "#343f50", "target-arrow-color": "#52617a", "target-arrow-shape": "triangle", "arrow-scale": .65, "curve-style": "straight", opacity: .6 } },
        { selector: "node:selected", style: { "border-color": "#ecfff7", "border-width": 3, "overlay-color": "#a1e4cb", "overlay-opacity": .1, "overlay-padding": 9, color: "#ffffff", "font-weight": 700 } },
        { selector: "node.hover", style: { "border-color": "#788a9f", "border-width": 3 } },
        { selector: "edge.connected", style: { "line-color": "#94cbbb", opacity: .95, width: 2 } },
        { selector: "node.archived", style: { "background-opacity": .45, "border-style": "dashed" } },
      ];
      const cy = cytoscape({ container: container.current, style, pixelRatio: 1, minZoom: .15, maxZoom: 3, wheelSensitivity: .2,
        elements: [
          ...data.nodes.map(node => ({ data: { id: node.id, type: node.type, label: node.title.length > 30 ? node.title.slice(0, 29) + "…" : node.title, color: nodeColors[node.type], size: Math.min(42, 20 + Math.sqrt(node.connections) * 5) }, classes: node.archivedAt ? "archived" : "" })),
          ...data.edges.map(edge => ({ data: { id: edge.id, source: edge.source, target: edge.target } })),
        ],
        layout: { name: "cose", animate: false, randomize: true, padding: 70, nodeRepulsion: () => 14000, idealEdgeLength: () => 100, numIter: data.nodes.length > 500 ? 120 : 400 },
      });
      instance.current = cy;
      if (selectedRef.current) { const node = cy.getElementById(selectedRef.current); node.select(); node.connectedEdges().addClass("connected"); }
      cy.on("tap", "node", event => handlers.current.onSelect(event.target.id()));
      cy.on("dbltap", "node", event => handlers.current.onOpen(event.target.id()));
      cy.on("mouseover", "node", event => { event.target.addClass("hover"); if (container.current) container.current.style.cursor = "pointer"; });
      cy.on("mouseout", "node", event => { event.target.removeClass("hover"); if (container.current) container.current.style.cursor = "grab"; });
      observer = new ResizeObserver(() => { cy.resize(); });
      observer.observe(container.current);
    });
    return () => { stopped = true; observer?.disconnect(); instance.current?.destroy(); instance.current = null; };
  }, [data]);
  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    cy.nodes().unselect(); cy.edges().removeClass("connected");
    if (selected) { const node = cy.getElementById(selected); node.select(); node.connectedEdges().addClass("connected"); }
  }, [selected, data]);
  return <div ref={container} className="graph-canvas" role="img" aria-label={`Grafo delle conoscenze con ${data.nodes.length} elementi. Usa l’elenco dei nodi per selezionarli con la tastiera.`} data-testid="graph-canvas" />;
});
