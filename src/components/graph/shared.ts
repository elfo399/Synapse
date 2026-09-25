import type { GraphData } from "@/domain/graph";
import type { ItemType } from "@/domain/types";

export const nodeColors: Record<ItemType, string> = {
  PROJECT: "#bda8e0",
  AREA: "#a8b8af",
  RESOURCE: "#9fbecb",
  TASK: "#d1b479",
  BOOKMARK: "#caa8b7",
};

// Canvas renderers need literal colors. Match the shared CSS design tokens.
export const graphColors = {
  background: "#151518",
  text: "#b0b0bc",
  textBright: "#eeeef2",
  muted: "#9898a4",
  accent: "#a99cf6",
  border: "#2c2c34",
  edge: "#60606d",
  edgeDim: "#303038",
  emissive: "#302940",
  hover: "#24212d",
  black: "#000000",
  labelBackground: "rgba(21,21,24,.88)",
};

export interface GraphControls {
  fit: () => void;
  zoom: (factor: number) => void;
  reset: () => void;
  rotate?: (axis: "horizontal" | "vertical", angle: number) => void;
}

export interface GraphCanvasProps {
  data: GraphData;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onUnavailable?: () => void;
}
