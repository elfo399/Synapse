import "dotenv/config";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ITEM_STATUSES, ITEM_TYPES } from "../src/domain/types";
import { normalizeIdentity } from "../src/domain/normalization";
import { prisma } from "../src/lib/db";
import { createItem, updateItem } from "../src/server/items";

const packItemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(200),
  type: z.enum(ITEM_TYPES),
  status: z.enum(ITEM_STATUSES).optional(),
  tags: z.array(z.string()).max(30).default([]),
  url: z.string().url().optional(),
  parentSlugs: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
  content: z.string().max(490_000),
}).strict();

const packSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  version: z.string().min(1),
  source: z.object({
    repository: z.string().url(),
    ref: z.string().min(7),
    capturedAt: z.string().min(10),
  }).strict(),
  items: z.array(packItemSchema).min(1),
}).strict();

type Pack = z.infer<typeof packSchema>;
type PackItem = z.infer<typeof packItemSchema>;

function option(name: string): string | undefined {
  const prefix = "--" + name + "=";
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function marker(packId: string, slug: string): string {
  return "<!-- synapse-knowledge-pack:" + packId + ":" + slug + " -->";
}

function managedContent(pack: Pack, item: PackItem): string {
  return [
    marker(pack.id, item.slug),
    "",
    item.content.trim(),
    "",
    "---",
    "",
    "_Knowledge pack gestito automaticamente: `" + pack.id + "` " + pack.version +
      ". Snapshot sorgente: `" + pack.source.ref + "` del " + pack.source.capturedAt + "._",
    "",
    "Repository sorgente: " + pack.source.repository,
  ].join("\n");
}

function extractManagedSlug(content: string, packId: string): string | null {
  const escaped = packId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp("^<!-- synapse-knowledge-pack:" + escaped + ":([a-z0-9-]+) -->"));
  return match?.[1] ?? null;
}

function topologicalItems(pack: Pack): PackItem[] {
  const bySlug = new Map(pack.items.map((item) => [item.slug, item]));
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const ordered: PackItem[] = [];

  const visit = (item: PackItem) => {
    if (seen.has(item.slug)) return;
    if (visiting.has(item.slug))
      throw new Error("Ciclo nei parentSlugs del knowledge pack: " + item.slug);
    visiting.add(item.slug);
    for (const parentSlug of item.parentSlugs) {
      const parent = bySlug.get(parentSlug);
      if (!parent)
        throw new Error("Parent mancante `" + parentSlug + "` per `" + item.slug + "`.");
      visit(parent);
    }
    visiting.delete(item.slug);
    seen.add(item.slug);
    ordered.push(item);
  };

  for (const item of pack.items) visit(item);
  return ordered;
}

async function loadPack(name: string): Promise<Pack> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Nome knowledge pack non valido.");
  const url = new URL("./knowledge-packs/" + name + ".json", import.meta.url);
  const raw = await readFile(url, "utf8");
  return packSchema.parse(JSON.parse(raw));
}

async function resolveUserId(): Promise<string> {
  const requestedEmail = (option("email") ?? process.env.SYNAPSE_IMPORT_USER_EMAIL)
    ?.trim()
    .toLowerCase();
  if (requestedEmail) {
    const user = await prisma.user.findUnique({
      where: { email: requestedEmail },
      select: { id: true },
    });
    if (!user) throw new Error("Nessun utente Synapse con email " + requestedEmail + ".");
    return user.id;
  }

  const users = await prisma.user.findMany({ select: { id: true }, take: 2 });
  if (users.length === 1) return users[0].id;
  if (users.length === 0)
    throw new Error("Nessun utente Synapse presente. Esegui prima db:bootstrap.");
  throw new Error(
    "Sono presenti più utenti. Usa --email <email> o SYNAPSE_IMPORT_USER_EMAIL.",
  );
}

async function syncPack(pack: Pack, userId: string, dryRun: boolean) {
  const ordered = topologicalItems(pack);
  const normalizedTitles = new Set<string>();
  const slugs = new Set<string>();
  for (const item of ordered) {
    const normalized = normalizeIdentity(item.title);
    if (normalizedTitles.has(normalized))
      throw new Error("Titolo duplicato nel pack: " + item.title);
    if (slugs.has(item.slug)) throw new Error("Slug duplicato nel pack: " + item.slug);
    normalizedTitles.add(normalized);
    slugs.add(item.slug);
  }

  const managedRows = await prisma.item.findMany({
    where: {
      userId,
      content: { contains: "<!-- synapse-knowledge-pack:" + pack.id + ":" },
    },
    select: { id: true, title: true, titleNormalized: true, content: true, version: true },
  });
  const managedBySlug = new Map<string, (typeof managedRows)[number]>();
  for (const row of managedRows) {
    const slug = extractManagedSlug(row.content, pack.id);
    if (slug) managedBySlug.set(slug, row);
  }

  const conflicts: string[] = [];
  for (const item of ordered) {
    const managed = managedBySlug.get(item.slug);
    const titleOwner = await prisma.item.findUnique({
      where: {
        userId_titleNormalized: {
          userId,
          titleNormalized: normalizeIdentity(item.title),
        },
      },
      select: { id: true, title: true, content: true },
    });
    if (titleOwner && titleOwner.id !== managed?.id)
      conflicts.push(item.title);
  }
  if (conflicts.length)
    throw new Error(
      "Import annullato: esistono elementi non gestiti con questi titoli: " +
        conflicts.join(", "),
    );

  if (dryRun) {
    for (const item of ordered)
      console.info((managedBySlug.has(item.slug) ? "UPDATE" : "CREATE") + " " + item.title);
    console.info("Dry run completato: " + ordered.length + " elementi.");
    return;
  }

  const ids = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const item of ordered) {
    const existing = managedBySlug.get(item.slug);
    const parentIds = item.parentSlugs.map((slug) => {
      const id = ids.get(slug) ?? managedBySlug.get(slug)?.id;
      if (!id) throw new Error("Parent non ancora disponibile: " + slug);
      return id;
    });
    const input = {
      title: item.title,
      content: managedContent(pack, item),
      type: item.type,
      status: item.status,
      inbox: false,
      tags: item.tags,
      url: item.url ?? null,
      parentIds,
      archived: false,
    };

    if (existing) {
      const result = await updateItem(userId, existing.id, {
        ...input,
        version: existing.version,
      });
      ids.set(item.slug, result.id);
      updated++;
    } else {
      const result = await createItem(userId, input);
      ids.set(item.slug, result.id);
      created++;
    }
  }

  console.info(
    "Knowledge pack " + pack.title + " sincronizzato: " + created + " creati, " + updated + " aggiornati.",
  );
}

async function main() {
  const packName = process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : "arcadia";
  const dryRun = process.argv.includes("--dry-run");
  const pack = await loadPack(packName);
  const userId = await resolveUserId();
  await syncPack(pack, userId, dryRun);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Import knowledge pack fallito.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
