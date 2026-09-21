import {
  ITEM_TYPES,
  type ItemType,
  type ItemSummary as DomainItemSummary,
} from "@/domain/types";
export const itemTypes = ITEM_TYPES;
export type {
  ItemType,
  ItemStatus,
  ItemDetail,
  ItemRelation as Relation,
  ItemListResponse,
  TagSummary as Tag,
} from "@/domain/types";
export type ItemSummary = DomainItemSummary & { snippet?: string };
export const typeLabels: Record<ItemType, string> = {
  NOTE: "Nota",
  TASK: "Attività",
  PROJECT: "Progetto",
  AREA: "Area",
  RESOURCE: "Risorsa",
  BOOKMARK: "Preferito",
};
export const typePluralLabels: Record<ItemType, string> = {
  NOTE: "Note",
  TASK: "Attività",
  PROJECT: "Progetti",
  AREA: "Aree",
  RESOURCE: "Risorse",
  BOOKMARK: "Preferiti",
};
export const typeRoutes: Record<ItemType, string> = {
  NOTE: "/notes",
  TASK: "/tasks",
  PROJECT: "/projects",
  AREA: "/areas",
  RESOURCE: "/resources",
  BOOKMARK: "/bookmarks",
};
export const newItemLabels: Record<ItemType, string> = {
  NOTE: "Nuova nota",
  TASK: "Nuova attività",
  PROJECT: "Nuovo progetto",
  AREA: "Nuova area",
  RESOURCE: "Nuova risorsa",
  BOOKMARK: "Nuovo preferito",
};
export const relationLabels = {
  PARENT: "Organizzato in",
  RELATED: "Collegato a",
  REFERENCES: "Riferimento",
};
export const pageLabels: Record<string, string> = {
  inbox: "Da organizzare",
  notes: "Note",
  tasks: "Attività",
  projects: "Progetti",
  areas: "Aree",
  resources: "Risorse",
  bookmarks: "Preferiti",
  archive: "Archivio",
  "tagged items": "Elementi con etichetta",
};
export const statusLabels: Record<string, string> = {
  ACTIVE: "Attivo",
  TODO: "Da fare",
  IN_PROGRESS: "In corso",
  DONE: "Completato",
  ON_HOLD: "In pausa",
  CANCELLED: "Annullato",
};
export function statusesFor(type: ItemType) {
  return type === "TASK"
    ? ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]
    : type === "PROJECT"
      ? ["ACTIVE", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"]
      : ["ACTIVE"];
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
