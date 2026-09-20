import { z } from "../lib/validation";
import { ITEM_STATUSES, ITEM_TYPES, RELATION_TYPES, type ItemStatus, type ItemType } from "./types";
import { normalizeTag } from "./normalization";

export const idSchema = z.string().min(1).max(128);
const titleSchema = z.string().trim().min(1, "Assegna un titolo all’elemento.").max(200).refine((value) => !/[\[\]\r\n|]/.test(value), "I titoli non possono contenere parentesi quadre, barre verticali o ritorni a capo.");
export const tagSchema = z.string().transform(normalizeTag).pipe(z.string().min(1).max(40).regex(/^[\p{L}\p{N}_\- ]+$/u, "Le etichette possono contenere lettere, numeri, spazi, trattini e trattini bassi."));
const urlSchema = z.string().max(2048).url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Usa un URL HTTP o HTTPS.");
export const itemSchema = z.object({
  title: titleSchema,
  content: z.string().max(500_000).default(""),
  type: z.enum(ITEM_TYPES).default("NOTE"),
  status: z.enum(ITEM_STATUSES).optional(),
  inbox: z.boolean().default(true),
  tags: z.array(tagSchema).max(30).default([]),
  url: urlSchema.nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  parentIds: z.array(idSchema).max(20).default([]),
  archived: z.boolean().default(false),
  version: z.number().int().positive().optional(),
}).strict();
// Creation defaults must never be applied to omitted PATCH properties.
export const itemPatchSchema = z.object({
  title: titleSchema.optional(),
  content: z.string().max(500_000).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  inbox: z.boolean().optional(),
  tags: z.array(tagSchema).max(30).optional(),
  url: urlSchema.nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  parentIds: z.array(idSchema).max(20).optional(),
  archived: z.boolean().optional(),
  version: z.number().int().positive().optional(),
}).strict();
export const relationSchema = z.object({ sourceItemId: idSchema, targetItemId: idSchema, relationType: z.enum(RELATION_TYPES).default("RELATED") }).strict();
export const itemQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(), status: z.enum(ITEM_STATUSES).optional(),
  inbox: z.enum(["true", "false"]).optional(), archive: z.enum(["active", "archived", "all"]).default("active"),
  tag: z.string().max(128).optional(), parent: idSchema.optional(), q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export function defaultStatus(type: ItemType): ItemStatus { return type === "TASK" ? "TODO" : "ACTIVE"; }
export function statusAllowed(type: ItemType, status: ItemStatus): boolean {
  if (type === "TASK") return ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"].includes(status);
  if (type === "PROJECT") return ["ACTIVE", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"].includes(status);
  return status === "ACTIVE";
}
