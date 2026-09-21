export const ITEM_TYPES = [
  "NOTE",
  "TASK",
  "PROJECT",
  "AREA",
  "RESOURCE",
  "BOOKMARK",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_STATUSES = [
  "ACTIVE",
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "ON_HOLD",
  "CANCELLED",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const RELATION_TYPES = ["RELATED", "PARENT", "REFERENCES"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface TagSummary {
  id: string;
  name: string;
  count?: number;
}
export interface ItemSummary {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  status: ItemStatus;
  inbox: boolean;
  url: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  version: number;
  tags: TagSummary[];
  attachments?: import("./attachments").AttachmentSummary[];
  _count?: { outgoing: number; incoming: number };
}
export interface RelationItem {
  id: string;
  title: string;
  type: ItemType;
  archivedAt: string | null;
  status?: ItemStatus;
  dueAt?: string | null;
}
export interface ItemRelation {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  relationType: RelationType;
  manual: boolean;
  wikilink: boolean;
  source: RelationItem;
  target: RelationItem;
}
export interface ItemDetail extends ItemSummary {
  outgoing: ItemRelation[];
  incoming: ItemRelation[];
  unresolvedWikilinks: string[];
}
export interface ItemInput {
  title: string;
  content?: string;
  type?: ItemType;
  status?: ItemStatus;
  inbox?: boolean;
  tags?: string[];
  url?: string | null;
  dueAt?: string | null;
  parentIds?: string[];
  archived?: boolean;
  version?: number;
}
export interface ItemListResponse {
  items: ItemSummary[];
  total: number;
  page: number;
  pageSize: number;
}
export interface DashboardData {
  counts: { inbox: number; tasks: number; projects: number; notes: number };
  todayTasks: ItemSummary[];
  activeProjects: ItemSummary[];
  recentItems: ItemSummary[];
}
