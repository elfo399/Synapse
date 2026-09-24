import { createHash, randomBytes } from "node:crypto";
import { unzipSync, zipSync } from "fflate";
import type { Prisma } from "@prisma/client";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { prisma } from "@/lib/db";
import { normalizeIdentity, normalizeTag } from "@/domain/normalization";
import { HttpError } from "./errors";
import { attachmentStorage, type StorageProvider } from "./storage";
import { safeFilename, validateUpload } from "./upload-validation";
import { withUserTransaction } from "./transactions";

const FORMAT = "synapse-export";
const VERSION = 1;
const text = new TextEncoder();
const decode = new TextDecoder();
const allowedTypes = new Set(["AREA", "PROJECT", "RESOURCE", "TASK"]);
const allowedRelations = new Set(["PARENT", "RELATED", "REFERENCES"]);
const allowedBlocks = new Set(["TEXT", "IMAGE", "AUDIO", "FILE", "LINK"]);

type ExportItem = {
  id: string;
  type: "AREA" | "PROJECT" | "RESOURCE" | "TASK";
  title: string;
  content: string;
  status: string;
  inbox: boolean;
  url: string | null;
  dueAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  blocks: {
    id: string;
    type: string;
    position: number;
    text: string | null;
    url: string | null;
    attachmentId: string | null;
  }[];
  attachments: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    sha256: string;
    duration: number | null;
    assetPath: string;
  }[];
};
type ExportRelation = {
  sourceItemId: string;
  targetItemId: string;
  relationType: string;
  isPrimary: boolean;
  manual: boolean;
  wikilink: boolean;
};

function jsonFile(value: unknown) {
  return text.encode(JSON.stringify(value, null, 2));
}

function safeAssetName(id: string, name: string) {
  return `assets/${id}-${safeFilename(name).replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
}

async function collectItemIds(userId: string, rootId: string) {
  const root = await prisma.item.findFirst({
    where: { userId, id: rootId },
    select: { id: true },
  });
  if (!root) throw new HttpError(404, "Elemento non trovato.");
  const ids = new Set([root.id]);
  let frontier = [root.id];
  while (frontier.length) {
    const next = await prisma.itemRelation.findMany({
      where: { userId, relationType: "PARENT", targetItemId: { in: frontier } },
      select: { sourceItemId: true },
    });
    frontier = next
      .map((relation) => relation.sourceItemId)
      .filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
    if (ids.size > 2_000)
      throw new HttpError(413, "L'esportazione contiene troppi elementi.");
  }
  return [...ids];
}

export async function exportArchive(
  userId: string,
  rootId: string,
  storage: StorageProvider = attachmentStorage(),
) {
  const ids = await collectItemIds(userId, rootId);
  const items = await prisma.item.findMany({
    where: { userId, id: { in: ids } },
    include: {
      tags: { include: { tag: true } },
      resourceBlocks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      attachments: true,
    },
  });
  const relations = await prisma.itemRelation.findMany({
    where: { userId, sourceItemId: { in: ids }, targetItemId: { in: ids } },
  });
  const records: ExportItem[] = items.map((item) => ({
    id: item.id,
    type:
      item.type === "NOTE" || item.type === "BOOKMARK"
        ? "RESOURCE"
        : (item.type as ExportItem["type"]),
    title: item.title,
    content: item.content,
    status: item.status,
    inbox: item.inbox,
    url: item.url,
    dueAt: item.dueAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    tags: item.tags.map(({ tag }) => tag.name),
    blocks: item.resourceBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      position: block.position,
      text: block.text,
      url: block.url,
      attachmentId: block.attachmentId,
    })),
    attachments: item.attachments.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
      duration: file.duration,
      assetPath: safeAssetName(file.id, file.originalName),
    })),
  }));
  const files: Record<string, Uint8Array> = {
    "manifest.json": jsonFile({
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      rootId,
      itemCount: records.length,
    }),
    "items.json": jsonFile(records),
    "relations.json": jsonFile(
      relations.map((relation) => ({
        sourceItemId: relation.sourceItemId,
        targetItemId: relation.targetItemId,
        relationType: relation.relationType,
        isPrimary: relation.isPrimary,
        manual: relation.manual,
        wikilink: relation.wikilink,
      })),
    ),
  };
  for (const item of records)
    for (const attachment of item.attachments) {
      const bytes = await storage.read(
        (await prisma.attachment.findUnique({
          where: { id: attachment.id },
          select: { storageKey: true },
        }))!.storageKey,
      );
      files[attachment.assetPath] = bytes;
    }
  return zipSync(files, { level: 6 });
}

function archiveJson<T>(files: Record<string, Uint8Array>, name: string): T {
  const data = files[name];
  if (!data)
    throw new HttpError(400, "L'archivio non contiene tutti i dati richiesti.");
  try {
    return JSON.parse(decode.decode(data)) as T;
  } catch {
    throw new HttpError(400, "L'archivio contiene dati non validi.");
  }
}

function validItem(value: unknown): value is ExportItem {
  if (!value || typeof value !== "object") return false;
  const item = value as ExportItem;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    allowedTypes.has(item.type) &&
    Array.isArray(item.tags) &&
    Array.isArray(item.blocks) &&
    Array.isArray(item.attachments)
  );
}

async function uniqueTitle(
  tx: Prisma.TransactionClient,
  userId: string,
  title: string,
) {
  const base = title.trim().slice(0, 200);
  for (let suffix = 1; suffix < 1000; suffix++) {
    const candidate =
      suffix === 1
        ? base
        : `${base.slice(0, Math.max(1, 195 - String(suffix).length))} (${suffix})`;
    if (
      !(await tx.item.findUnique({
        where: {
          userId_titleNormalized: {
            userId,
            titleNormalized: normalizeIdentity(candidate),
          },
        },
        select: { id: true },
      }))
    )
      return candidate;
  }
  throw new HttpError(
    409,
    "Non riesco a assegnare titoli univoci agli elementi importati.",
  );
}

export async function importArchive(
  userId: string,
  bytes: Uint8Array,
  targetId?: string,
  storage: StorageProvider = attachmentStorage(),
) {
  if (bytes.byteLength > 100 * 1024 * 1024)
    throw new HttpError(413, "L'archivio supera 100 MB.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new HttpError(400, "Il file non Ã¨ un archivio Synapse valido.");
  }
  if (
    Object.keys(files).some(
      (name) =>
        name.startsWith("/") || name.includes("..") || name.includes("\\"),
    )
  )
    throw new HttpError(400, "L'archivio contiene percorsi non validi.");
  if (!files["manifest.json"] && files["index.html"])
    throw new HttpError(
      400,
      "Questo Ã¨ un'esportazione in formato leggibile. Puoi consultarla nel browser, ma per importare scegli Archivio Synapse.",
    );
  const manifest = archiveJson<{
    format?: string;
    version?: number;
    rootId?: string;
  }>(files, "manifest.json");
  if (
    manifest.format !== FORMAT ||
    manifest.version !== VERSION ||
    typeof manifest.rootId !== "string"
  )
    throw new HttpError(400, "Versione dell'archivio non supportata.");
  const manifestRootId = manifest.rootId;
  const items = archiveJson<unknown[]>(files, "items.json");
  const relations = archiveJson<unknown[]>(files, "relations.json");
  if (!items.length || items.length > 2_000 || !items.every(validItem))
    throw new HttpError(400, "Gli elementi dell'archivio non sono validi.");
  if (targetId) {
    const target = await prisma.item.findFirst({
      where: { userId, id: targetId },
      select: { id: true, type: true },
    });
    if (!target || !["AREA", "PROJECT"].includes(target.type))
      throw new HttpError(
        400,
        "Puoi importare dentro un'Area o un Progetto esistente.",
      );
  }
  const attachmentInputs = items.flatMap((item) =>
    item.attachments.map((attachment) => ({ item, attachment })),
  );
  if (attachmentInputs.length > 100)
    throw new HttpError(413, "L'archivio contiene troppi allegati.");
  const prepared = attachmentInputs.map(({ attachment }) => {
    const raw = files[attachment.assetPath];
    if (
      !raw ||
      raw.byteLength !== attachment.size ||
      createHash("sha256").update(raw).digest("hex") !== attachment.sha256
    )
      throw new HttpError(400, "Un allegato Ã¨ mancante o danneggiato.");
    return {
      oldId: attachment.id,
      name: safeFilename(attachment.originalName),
      type: validateUpload(
        Buffer.from(raw),
        attachment.originalName,
        attachment.mimeType,
      ),
      bytes: raw,
      duration: attachment.duration,
      storageKey: randomBytes(32).toString("hex"),
      sha256: attachment.sha256,
    };
  });
  const stored: string[] = [];
  try {
    for (const file of prepared) {
      await storage.save(file.storageKey, file.bytes);
      stored.push(file.storageKey);
    }
    const result = await withUserTransaction(userId, async (tx) => {
      const ids = new Map<string, string>();
      const attachmentIds = new Map<string, string>();
      for (const record of items as ExportItem[]) {
        const title = await uniqueTitle(tx, userId, record.title);
        const created = await tx.item.create({
          data: {
            userId,
            title,
            titleNormalized: normalizeIdentity(title),
            type: record.type,
            content: record.content || "",
            status: record.status as never,
            inbox: record.inbox,
            url: record.type === "RESOURCE" ? null : record.url,
            dueAt: record.dueAt ? new Date(record.dueAt) : null,
            archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
          },
        });
        ids.set(record.id, created.id);
        for (const name of [
          ...new Set(record.tags.map(normalizeTag).filter(Boolean)),
        ]) {
          const tag = await tx.tag.upsert({
            where: { userId_normalizedName: { userId, normalizedName: name } },
            create: { userId, name, normalizedName: name },
            update: {},
          });
          await tx.itemTag.create({
            data: { userId, itemId: created.id, tagId: tag.id },
          });
        }
      }
      for (const file of prepared) {
        const owner = attachmentInputs.find(
          (entry) => entry.attachment.id === file.oldId,
        )!;
        const itemId = ids.get(owner.item.id)!;
        const created = await tx.attachment.create({
          data: {
            userId,
            itemId,
            originalName: file.name,
            mimeType: file.type,
            size: file.bytes.byteLength,
            sha256: file.sha256,
            storageKey: file.storageKey,
            duration: file.duration,
          },
        });
        attachmentIds.set(file.oldId, created.id);
      }
      for (const record of items as ExportItem[]) {
        const resourceId = ids.get(record.id)!;
        for (const block of record.blocks)
          if (allowedBlocks.has(block.type))
            await tx.resourceBlock.create({
              data: {
                userId,
                resourceId,
                type: block.type as
                  "TEXT" | "IMAGE" | "AUDIO" | "FILE" | "LINK",
                position: Number.isInteger(block.position) ? block.position : 0,
                text: typeof block.text === "string" ? block.text : null,
                url:
                  typeof block.url === "string" &&
                  /^https?:\/\//.test(block.url)
                    ? block.url
                    : null,
                attachmentId: block.attachmentId
                  ? (attachmentIds.get(block.attachmentId) ?? null)
                  : null,
              },
            });
      }
      for (const raw of relations) {
        const relation = raw as ExportRelation;
        const sourceItemId = ids.get(relation?.sourceItemId);
        const targetItemId = ids.get(relation?.targetItemId);
        if (
          !sourceItemId ||
          !targetItemId ||
          sourceItemId === targetItemId ||
          !allowedRelations.has(relation?.relationType)
        )
          continue;
        const source = items.find((item) => item.id === relation.sourceItemId)!;
        const target = items.find((item) => item.id === relation.targetItemId)!;
        const parentAllowed =
          relation.relationType !== "PARENT" ||
          (["AREA", "PROJECT"].includes(target.type) && source.type !== "AREA");
        await tx.itemRelation
          .create({
            data: {
              userId,
              sourceItemId,
              targetItemId,
              relationType: (parentAllowed
                ? relation.relationType
                : "RELATED") as never,
              isPrimary: parentAllowed && relation.isPrimary,
              manual: Boolean(relation.manual),
              wikilink: Boolean(relation.wikilink),
            },
          })
          .catch(() => {});
      }
      const rootId = ids.get(manifestRootId);
      if (!rootId)
        throw new HttpError(400, "La radice dell'archivio non Ã¨ presente.");
      if (targetId)
        await tx.itemRelation.create({
          data: {
            userId,
            sourceItemId: rootId,
            targetItemId: targetId,
            relationType: "PARENT",
            isPrimary: true,
            manual: true,
          },
        });
      const root = items.find((item) => item.id === manifestRootId)!;
      return { itemId: rootId, title: root.title };
    });
    return result;
  } catch (error) {
    await Promise.all(
      stored.map((key) => storage.delete(key).catch(() => undefined)),
    );
    throw error;
  }
}

function readableSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "raccolta"
  );
}
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index + 1);
}
function relativePath(from: string, to: string) {
  const fromParts = dirname(from).split("/").filter(Boolean);
  const toParts = to.split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return `${
    fromParts
      .map(() => "..")
      .concat(toParts)
      .join("/") || "."
  }`;
}
function resolveReadableWikiLinks(
  markdown: string,
  fromPath: string,
  targetPaths: Map<string, string>,
  titles: Map<string, ExportItem>,
) {
  return markdown.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
    (_match, rawTitle: string, rawLabel?: string) => {
      const title = rawTitle.trim();
      const label = (rawLabel || title).trim();
      const target = titles.get(normalizeIdentity(title));
      const targetPath = target ? targetPaths.get(target.id) : undefined;
      if (!targetPath)
        return `**${label}** _(riferimento non incluso nell'esportazione)_`;
      return `[${label}](${relativePath(fromPath, targetPath)})`;
    },
  );
}
async function readableMarkdown(
  markdown: string,
  fromPath: string,
  targetPaths: Map<string, string>,
  titles: Map<string, ExportItem>,
) {
  const withResolvedWikiLinks = resolveReadableWikiLinks(
    markdown,
    fromPath,
    targetPaths,
    titles,
  );
  const rendered = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(rehypeStringify)
      .process(withResolvedWikiLinks),
  );
  return rendered.replace(
    /<img([^>]*?)src="([^"]+)"([^>]*)>/g,
    (_match, before: string, src: string, after: string) =>
      `<a class="image-link" href="${src}" target="_blank" rel="noreferrer" aria-label="Apri l'immagine a dimensione originale"><img${before}src="${src}"${after}></a>`,
  );
}
function readableHtml(title: string, subtitle: string, body: string) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>:root{color-scheme:light dark;--page:#f6f6f9;--surface:#fff;--text:#202027;--muted:#686878;--border:#dedee5;--link:#5541ae;--accent:#6754b8;--code:#f0eff5}@media(prefers-color-scheme:dark){:root{--page:#15151b;--surface:#202027;--text:#f0eff7;--muted:#b7b5c3;--border:#383742;--link:#b9aaff;--accent:#c2b6ff;--code:#292832}}*{box-sizing:border-box}html{overflow-x:hidden}body{margin:0;min-width:0;background:var(--page);color:var(--text);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1040px;margin:auto;padding:clamp(32px,7vw,72px) clamp(16px,4vw,40px)}header{max-width:780px;border-bottom:1px solid var(--border);padding-bottom:24px;margin-bottom:36px}.eyebrow{color:var(--accent);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1,h2,h3{line-height:1.2}h1{margin:.35rem 0;font-size:clamp(2rem,5vw,3.35rem)}h2{margin:2.4rem 0 1rem;font-size:clamp(1.35rem,3vw,1.8rem)}h3{margin:1.8rem 0 .7rem}p,li{max-width:76ch}a{color:var(--link);overflow-wrap:anywhere}a:hover{color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card{display:block;padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:inherit;text-decoration:none}.card:hover{border-color:var(--accent);box-shadow:0 5px 20px #19153322}.card strong,.card .meta{display:block}.meta{color:var(--muted);font-size:.9rem}.resource{max-width:820px;padding:clamp(18px,4vw,34px);background:var(--surface);border:1px solid var(--border);border-radius:18px}.resource>section+section{margin-top:1.75rem}.resource figure{display:grid;justify-items:center;gap:.5rem;margin:1.75rem auto;max-width:100%}.resource figure>a,.resource .image-link{display:flex;justify-content:center;max-width:100%}.resource img{display:block;max-width:100%;width:auto;height:auto;max-height:420px;object-fit:contain;margin:auto;border:1px solid var(--border);border-radius:12px;cursor:zoom-in}.resource figcaption{text-align:center}.resource audio{width:min(100%,520px)}.attachment{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 0;border-top:1px solid var(--border)}blockquote{margin:1.4rem 0;padding:.25rem 0 .25rem 1rem;border-left:3px solid var(--accent);color:var(--muted)}pre{max-width:100%;overflow:auto;padding:14px;border-radius:10px;background:var(--code);border:1px solid var(--border)}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}th,td{padding:.6rem .8rem;border:1px solid var(--border);text-align:left}.task{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;padding:11px 0;border-top:1px solid var(--border)}.task:first-of-type{border-top:0}.empty{max-width:620px;padding:30px 22px;border:1px dashed var(--border);border-radius:14px;text-align:center;color:var(--muted)}.empty h2{margin:0 0 .5rem;color:var(--text);font-size:1.25rem}@media(max-width:580px){main{padding:30px 16px}.resource{padding:18px}.task{grid-template-columns:1fr}.task span{font-size:.9rem}}</style></head><body><main><header><div class="eyebrow">Esportazione Synapse</div><h1>${escapeHtml(title)}</h1><p class="meta">${escapeHtml(subtitle)}</p></header>${body}</main></body></html>`;
}

export async function exportReadableArchive(
  userId: string,
  rootId: string,
  storage: StorageProvider = attachmentStorage(),
) {
  const native = await exportArchive(userId, rootId, storage);
  const source = unzipSync(native);
  const manifest = archiveJson<{ rootId: string }>(source, "manifest.json");
  const records = archiveJson<ExportItem[]>(source, "items.json");
  const relations = archiveJson<ExportRelation[]>(source, "relations.json");
  const items = new Map(records.map((item) => [item.id, item]));
  const itemsByTitle = new Map(
    records.map((item) => [normalizeIdentity(item.title), item]),
  );
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  for (const relation of relations)
    if (
      relation.relationType === "PARENT" &&
      items.has(relation.sourceItemId) &&
      items.has(relation.targetItemId)
    ) {
      const values = children.get(relation.targetItemId) ?? [];
      values.push(relation.sourceItemId);
      children.set(relation.targetItemId, values);
      if (relation.isPrimary || !parent.has(relation.sourceItemId))
        parent.set(relation.sourceItemId, relation.targetItemId);
    }
  const root = items.get(manifest.rootId);
  if (!root)
    throw new HttpError(400, "L'archivio non contiene l'elemento principale.");
  const rootItem = root;
  const pages = new Map<string, string>();
  const markdownPages = new Map<string, string>();
  const used = new Set<string>();
  function uniquePath(directory: string, title: string, suffix: string) {
    const base = readableSlug(title);
    let candidate = `${directory}${base}${suffix}`;
    let number = 2;
    while (used.has(candidate))
      candidate = `${directory}${base}-${number++}${suffix}`;
    used.add(candidate);
    return candidate;
  }
  function assign(itemId: string, path: string) {
    pages.set(itemId, path);
    used.add(path);
    const item = items.get(itemId)!;
    if (item.type === "RESOURCE")
      markdownPages.set(
        itemId,
        itemId === rootItem.id ? "resource.md" : path.replace(/\.html$/, ".md"),
      );
    const taken = new Set<string>();
    for (const childId of children.get(itemId) ?? []) {
      const child = items.get(childId)!;
      if (child.type === "TASK") continue;
      const category =
        child.type === "PROJECT"
          ? "projects/"
          : child.type === "AREA"
            ? "areas/"
            : "resources/";
      const directory = `${dirname(path)}${category}`;
      const childPath =
        child.type === "RESOURCE"
          ? uniquePath(directory, child.title, ".html")
          : uniquePath(directory, child.title, "/index.html");
      if (!taken.has(childPath)) {
        taken.add(childPath);
        assign(childId, childPath);
      }
    }
  }
  assign(root.id, "index.html");
  const readableAssets = new Map<string, string>();
  const assetUsed = new Set<string>();
  for (const item of records)
    for (const attachment of item.attachments) {
      const original = safeFilename(attachment.originalName);
      const dot = original.lastIndexOf(".");
      const stem = dot > 0 ? original.slice(0, dot) : original;
      const extension = dot > 0 ? original.slice(dot) : "";
      let candidate = `assets/${readableSlug(stem)}${extension}`;
      let number = 2;
      while (assetUsed.has(candidate))
        candidate = `assets/${readableSlug(stem)}-${number++}${extension}`;
      assetUsed.add(candidate);
      readableAssets.set(attachment.id, candidate);
    }
  const output: Record<string, Uint8Array> = {};
  for (const item of records)
    for (const attachment of item.attachments) {
      const bytes = source[attachment.assetPath];
      if (!bytes)
        throw new HttpError(
          400,
          "Un allegato non Ã¨ disponibile per l'esportazione.",
        );
      output[readableAssets.get(attachment.id)!] = bytes;
    }
  const itemLinks = (item: ExportItem, from: string, markdown = false) => {
    const links = relations
      .filter(
        (relation) =>
          relation.sourceItemId === item.id &&
          relation.relationType !== "PARENT",
      )
      .map((relation) => items.get(relation.targetItemId))
      .filter(Boolean) as ExportItem[];
    if (!links.length) return "";
    return markdown
      ? `\n\n## Collegamenti\n${links.map((target) => `- [${target.title}](${relativePath(markdownPages.get(item.id) || from, markdownPages.get(target.id) || pages.get(target.id) || "index.html")})`).join("\n")}`
      : `<section><h2>Collegamenti</h2><div class="grid">${links.map((target) => `<a class="card" href="${relativePath(from, pages.get(target.id) || "index.html")}"><strong>${escapeHtml(target.title)}</strong><span class="meta">${escapeHtml(target.type === "RESOURCE" ? "Risorsa" : target.type === "PROJECT" ? "Progetto" : "Area")}</span></a>`).join("")}</div></section>`;
  };
  function resourceMarkdown(item: ExportItem, path: string) {
    const attachment = new Map(item.attachments.map((file) => [file.id, file]));
    const blocks = [...item.blocks]
      .sort((a, b) => a.position - b.position)
      .map((block) => {
        if (block.type === "TEXT")
          return resolveReadableWikiLinks(
            block.text || "",
            path,
            markdownPages,
            itemsByTitle,
          );
        if (block.type === "LINK")
          return block.url ? `[${block.url}](${block.url})` : "";
        const file = block.attachmentId
          ? attachment.get(block.attachmentId)
          : undefined;
        if (!file) return "";
        const asset = relativePath(path, readableAssets.get(file.id)!);
        if (block.type === "IMAGE") return `![${file.originalName}](${asset})`;
        if (block.type === "AUDIO")
          return `<audio controls src="${asset}">${file.originalName}</audio>`;
        return `[${file.originalName}](${asset})`;
      })
      .filter(Boolean);
    return `# ${item.title}\n\n${item.tags.length ? `${item.tags.map((tag) => `#${tag}`).join(" ")}\n\n` : ""}${blocks.join("\n\n")}${itemLinks(item, path, true)}\n`;
  }
  async function resourceBody(item: ExportItem, path: string) {
    const attachment = new Map(item.attachments.map((file) => [file.id, file]));
    const blocks = (
      await Promise.all(
        [...item.blocks]
          .sort((a, b) => a.position - b.position)
          .map(async (block) => {
            if (block.type === "TEXT")
              return `<section>${await readableMarkdown(block.text || "", path, pages, itemsByTitle)}</section>`;
            if (block.type === "LINK")
              return block.url
                ? `<p class="attachment"><a href="${escapeHtml(block.url)}" rel="noreferrer">${escapeHtml(block.url)}</a></p>`
                : "";
            const file = block.attachmentId
              ? attachment.get(block.attachmentId)
              : undefined;
            if (!file) return "";
            const asset = relativePath(path, readableAssets.get(file.id)!);
            if (block.type === "IMAGE")
              return `<figure><a href="${asset}" target="_blank" rel="noreferrer" aria-label="Apri ${escapeHtml(file.originalName)} a dimensione originale"><img src="${asset}" alt="${escapeHtml(file.originalName)}"></a><figcaption class="meta">${escapeHtml(file.originalName)}</figcaption></figure>`;
            if (block.type === "AUDIO")
              return `<div class="attachment"><strong>${escapeHtml(file.originalName)}</strong><audio controls src="${asset}"></audio></div>`;
            return `<p class="attachment"><a href="${asset}">${escapeHtml(file.originalName)}</a><span class="meta">Documento</span></p>`;
          }),
      )
    ).join("");
    return `<article class="resource">${blocks || '<div class="empty"><h2>Questa risorsa Ã¨ vuota</h2><p>Non contiene ancora testo, allegati o collegamenti da consultare.</p></div>'}</article>${itemLinks(item, path)}`;
  }
  async function collectionBody(item: ExportItem, path: string) {
    const direct = (children.get(item.id) ?? [])
      .map((id) => items.get(id)!)
      .filter(Boolean);
    const projects = direct.filter((child) => child.type === "PROJECT");
    const resources = direct.filter((child) => child.type === "RESOURCE");
    const tasks = direct.filter((child) => child.type === "TASK");
    const section = (label: string, values: ExportItem[]) =>
      values.length
        ? `<section><h2>${label}</h2><div class="grid">${values.map((child) => `<a class="card" href="${relativePath(path, pages.get(child.id) || "index.html")}"><strong>${escapeHtml(child.title)}</strong><span class="meta">${child.type === "PROJECT" ? "Progetto" : child.type === "RESOURCE" ? "Risorsa" : "Area"}</span></a>`).join("")}</div></section>`
        : "";
    const taskSummary = tasks.length
      ? `<section><h2>AttivitÃ </h2>${tasks.map((task) => `<div class="task"><strong>${escapeHtml(task.title)}</strong><span class="meta">${escapeHtml(task.status)}</span><span class="meta">${task.dueAt ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(task.dueAt)) : "Nessuna scadenza"}</span></div>`).join("")}</section>`
      : "";
    return `${item.content ? `<section class="resource">${await readableMarkdown(item.content, path, pages, itemsByTitle)}</section>` : ""}${section("Progetti", projects)}${section("Risorse", resources)}${section(
      "Aree",
      direct.filter((child) => child.type === "AREA"),
    )}${taskSummary}${itemLinks(item, path)}`;
  }
  for (const item of records) {
    const path = pages.get(item.id);
    if (!path) continue;
    if (item.type === "RESOURCE") {
      const markdown = resourceMarkdown(item, markdownPages.get(item.id)!);
      output[markdownPages.get(item.id)!] = text.encode(markdown);
      output[path] = text.encode(
        readableHtml(
          item.title,
          "Risorsa",
          `${await resourceBody(item, path)}<p><a href="${relativePath(path, markdownPages.get(item.id)!)}">Apri il Markdown modificabile</a></p>`,
        ),
      );
    } else
      output[path] = text.encode(
        readableHtml(
          item.title,
          item.type === "PROJECT" ? "Progetto" : "Area",
          await collectionBody(item, path),
        ),
      );
  }
  output["index.html"] = output[pages.get(root.id)!];
  output["README.txt"] = text.encode(
    "Esportazione leggibile Synapse\n\nEstrai completamente lo ZIP in una cartella prima di aprire index.html: immagini, audio, PDF e collegamenti interni funzionano solo con la struttura completa dei file. I file Markdown delle risorse restano modificabili. Questo formato e solo per la consultazione: per reimportare usa Archivio Synapse.\n",
  );
  return zipSync(output, { level: 6 });
}
