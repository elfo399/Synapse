import { z } from "../lib/validation";
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  RELATION_TYPES,
  type ItemStatus,
  type ItemType,
} from "./types";
import { TIME_BLOCK_STATUSES } from "./types";
import { normalizeTag } from "./normalization";

export const idSchema = z.string().min(1).max(128);
const titleSchema = z
  .string()
  .trim()
  .min(1, "Assegna un titolo all’elemento.")
  .max(200)
  .refine(
    (value) => !/[\[\]\r\n|]/.test(value),
    "I titoli non possono contenere parentesi quadre, barre verticali o ritorni a capo.",
  );
export const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(1)
      .max(40)
      .regex(
        /^[\p{L}\p{N}_\- ]+$/u,
        "Le etichette possono contenere lettere, numeri, spazi, trattini e trattini bassi.",
      ),
  );
const urlSchema = z
  .string()
  .max(2048)
  .url()
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Usa un URL HTTP o HTTPS.",
  );
export const itemSchema = z
  .object({
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
  })
  .strict();
// Creation defaults must never be applied to omitted PATCH properties.
export const itemPatchSchema = z
  .object({
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
  })
  .strict();
export const relationSchema = z
  .object({
    sourceItemId: idSchema,
    targetItemId: idSchema,
    relationType: z.enum(RELATION_TYPES).default("RELATED"),
  })
  .strict();
export const itemQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  inbox: z.enum(["true", "false"]).optional(),
  archive: z.enum(["active", "archived", "all"]).default("active"),
  tag: z.string().max(128).optional(),
  parent: idSchema.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const datetimeSchema = z.string().datetime({ offset: true });
const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: datetimeSchema.nullable().optional(),
}).strict().nullable().optional();
export const timeBlockSchema = z.object({
  title: z.string().trim().min(1, "Inserisci un titolo.").max(200),
  description: z.string().max(20_000).default(""),
  startsAt: datetimeSchema,
  endsAt: datetimeSchema,
  timezone: z.string().trim().min(1).max(64).default("Europe/Rome"),
  categoryId: idSchema,
  status: z.enum(TIME_BLOCK_STATUSES).default("PLANNED"),
  itemId: idSchema.nullable().optional(),
  recurrence: recurrenceSchema,
}).strict().superRefine((value, ctx) => {
  const duration = new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime();
  if (duration <= 0) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fine deve seguire l’inizio." });
  if (duration > 24 * 60 * 60 * 1000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Un blocco può durare al massimo 24 ore." });
  if (value.recurrence?.frequency === "WEEKLY" && value.recurrence.weekdays?.length === 0) ctx.addIssue({ code: "custom", path: ["recurrence", "weekdays"], message: "Scegli almeno un giorno." });
});
export const timeBlockPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20_000).optional(),
  startsAt: datetimeSchema.optional(), endsAt: datetimeSchema.optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  categoryId: idSchema.optional(), status: z.enum(TIME_BLOCK_STATUSES).optional(),
  itemId: idSchema.nullable().optional(), recurrence: recurrenceSchema,
}).strict();
export const plannerCategorySchema = z.object({
  name: z.string().trim().min(1, "Inserisci un nome per la categoria.").max(60),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Inserisci un colore HEX valido."),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
}).strict();
export const plannerCategoryPatchSchema = z.object({
  name: z.string().trim().min(1, "Inserisci un nome per la categoria.").max(60).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Inserisci un colore HEX valido.").optional(),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  archived: z.boolean().optional(),
}).strict();
export const plannerRangeSchema = z.object({ from: datetimeSchema, to: datetimeSchema }).strict().superRefine((v, ctx) => {
  if (new Date(v.to).getTime() <= new Date(v.from).getTime()) ctx.addIssue({ code: "custom", message: "Intervallo non valido." });
  if (new Date(v.to).getTime() - new Date(v.from).getTime() > 9 * 24 * 60 * 60 * 1000) ctx.addIssue({ code: "custom", message: "Scegli al massimo una settimana." });
});

export function defaultStatus(type: ItemType): ItemStatus {
  return type === "TASK" ? "TODO" : "ACTIVE";
}
export function statusAllowed(type: ItemType, status: ItemStatus): boolean {
  if (type === "TASK")
    return ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"].includes(status);
  if (type === "PROJECT")
    return ["ACTIVE", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"].includes(
      status,
    );
  return status === "ACTIVE";
}
