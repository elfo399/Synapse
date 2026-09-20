import type { ItemType, RelationType, TagSummary } from "./types";

export interface GraphNode {
  id: string;
  title: string;
  type: ItemType;
  tags: TagSummary[];
  archivedAt: string | null;
  connections: number;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;
  limit: number;
  truncated: boolean;
}
