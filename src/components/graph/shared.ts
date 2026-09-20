import type { GraphData } from "@/domain/graph";
import type { ItemType } from "@/domain/types";

export const nodeColors: Record<ItemType, string> = {
  NOTE: "#a2b9f9", PROJECT: "#c4a6f9", AREA: "#f3bd80",
  RESOURCE: "#8ddac5", TASK: "#efcf81", BOOKMARK: "#ee9fae",
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
