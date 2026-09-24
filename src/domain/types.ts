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
export const TIME_BLOCK_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
] as const;
export type TimeBlockStatus = (typeof TIME_BLOCK_STATUSES)[number];
export interface PlannerCategorySummary {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  archivedAt: string | null;
}
export interface TimeBlockSummary {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  categoryId: string;
  categoryColor: string | null;
  category: PlannerCategorySummary;
  status: TimeBlockStatus;
  itemId: string | null;
  recurrence: {
    frequency: "DAILY" | "WEEKLY";
    weekdays?: number[];
    until?: string | null;
  } | null;
  item?: Pick<ItemSummary, "id" | "title" | "type" | "status" | "dueAt"> | null;
  actualMinutes: number;
  conflict: boolean;
}
export interface PlannerData {
  blocks: TimeBlockSummary[];
  tasks: ItemSummary[];
  templates: { id: string; name: string; blocks: unknown }[];
  categories: PlannerCategorySummary[];
  summary: {
    category: PlannerCategorySummary;
    planned: number;
    actual: number;
  }[];
}

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
  content?: string;
  url?: string | null;
}
export interface ItemRelation {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  relationType: RelationType;
  isPrimary: boolean;
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
  primaryParentId?: string | null;
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
