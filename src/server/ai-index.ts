import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const EMBEDDING_DIMENSIONS = 1024;
const MAX_CHUNK_CHARS = 1_350;
const CHUNK_OVERLAP_CHARS = 180;
let indexing = false;

type IndexedItem = {
  id: string;
  userId: string;
  version: number;
  title: string;
  type: string;
  status: string;
  content: string;
  url: string | null;
  tags: { tag: { name: string } }[];
};
export type SemanticHit = {
  itemId: string;
  title: string;
  type: string;
  excerpt: string;
  rank: number;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function cleanMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deterministic, paragraph-first chunks. Item records remain the canonical source. */
export function chunkItemText(
  item: Pick<
    IndexedItem,
    "title" | "type" | "status" | "content" | "url" | "tags"
  >,
) {
  const text = cleanMarkdown(item.content);
  if (!text) return [];
  const metadata = [
    `Titolo: ${item.title}`,
    `Tipo: ${item.type}`,
    `Stato: ${item.status}`,
    item.tags.length
      ? `Etichette: ${item.tags.map(({ tag }) => tag.name).join(", ")}`
      : "",
    item.url ? `URL: ${item.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const paragraphs = text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÀ-Ú])/u)
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    let remaining = paragraph;
    while (remaining.length > MAX_CHUNK_CHARS) {
      let cut = remaining.lastIndexOf(" ", MAX_CHUNK_CHARS);
      if (cut < MAX_CHUNK_CHARS * 0.55) cut = MAX_CHUNK_CHARS;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining
        .slice(Math.max(0, cut - CHUNK_OVERLAP_CHARS))
        .trim();
    }
    current = remaining;
  }
  if (current) chunks.push(current);
  return chunks.map((chunk) => `${metadata}\n\nContenuto:\n${chunk}`);
}

function vectorLiteral(values: number[]) {
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  )
    throw new Error("Embedding non valido.");
  return `[${values.join(",")}]`;
}

async function embed(baseUrl: string, model: string, input: string[]) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(
      Number(process.env.OLLAMA_TIMEOUT_MS ?? 90_000),
    ),
    body: JSON.stringify({ model, input }),
  });
  if (!response.ok)
    throw new Error("Il modello di embedding non è disponibile.");
  const body = (await response.json()) as { embeddings?: number[][] };
  if (!body.embeddings || body.embeddings.length !== input.length)
    throw new Error("Ollama non ha restituito tutti gli embedding.");
  return body.embeddings.map(vectorLiteral);
}

export async function queueItemEmbedding(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
  itemVersion: number,
) {
  await tx.aiEmbeddingJob.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, itemVersion, state: "PENDING" },
    update: { itemVersion, state: "PENDING", attempts: 0, lastError: null },
  });
}

async function indexOne(job: {
  id: string;
  userId: string;
  itemId: string;
  itemVersion: number;
}) {
  const item = (await prisma.item.findFirst({
    where: { id: job.itemId, userId: job.userId },
    select: {
      id: true,
      userId: true,
      version: true,
      title: true,
      type: true,
      status: true,
      content: true,
      url: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
  })) as IndexedItem | null;
  if (!item) {
    await prisma.aiEmbeddingJob.deleteMany({ where: { id: job.id } });
    return;
  }
  if (item.version !== job.itemVersion) {
    await prisma.aiEmbeddingJob.update({
      where: { id: job.id },
      data: { itemVersion: item.version, state: "PENDING" },
    });
    return;
  }
  const chunks = chunkItemText(item);
  if (!chunks.length) {
    await prisma.$transaction([
      prisma.itemEmbeddingChunk.deleteMany({
        where: { userId: item.userId, itemId: item.id },
      }),
      prisma.aiEmbeddingJob.delete({ where: { id: job.id } }),
    ]);
    return;
  }
  const hashes = chunks.map(hash);
  const previous = await prisma.itemEmbeddingChunk.findMany({
    where: { userId: item.userId, itemId: item.id },
    select: { chunkIndex: true, contentHash: true },
  });
  const unchanged =
    previous.length === chunks.length &&
    previous.every(
      (row, index) =>
        row.chunkIndex === index && row.contentHash === hashes[index],
    );
  if (unchanged) {
    await prisma.$transaction([
      prisma.$executeRaw(
        Prisma.sql`UPDATE "ItemEmbeddingChunk" SET "itemVersion"=${item.version}, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${item.userId} AND "itemId"=${item.id}`,
      ),
      prisma.aiEmbeddingJob.delete({ where: { id: job.id } }),
    ]);
    return;
  }
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";
  const model = process.env.OLLAMA_EMBEDDING_MODEL ?? "qwen3-embedding:0.6b";
  const vectors = await embed(baseUrl, model, chunks);
  await prisma.$transaction(async (tx) => {
    await tx.itemEmbeddingChunk.deleteMany({
      where: { userId: item.userId, itemId: item.id },
    });
    for (let index = 0; index < chunks.length; index += 1) {
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "ItemEmbeddingChunk" ("id", "userId", "itemId", "itemVersion", "chunkIndex", "content", "contentHash", "embedding", "createdAt", "updatedAt") VALUES (${crypto.randomUUID().replace(/-/g, "")}, ${item.userId}, ${item.id}, ${item.version}, ${index}, ${chunks[index]}, ${hashes[index]}, ${vectors[index]}::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
    }
    await tx.aiEmbeddingJob.delete({ where: { id: job.id } });
  });
}

/** Runs a small bounded amount of durable work. It never blocks item saves. */
export async function processEmbeddingJobs(limit = 1) {
  if (indexing || process.env.AI_ENABLED !== "true") return 0;
  indexing = true;
  let completed = 0;
  try {
    for (let count = 0; count < Math.min(Math.max(limit, 1), 20); count += 1) {
      const job = await prisma.aiEmbeddingJob.findFirst({
        where: { state: { in: ["PENDING", "FAILED"] } },
        orderBy: { updatedAt: "asc" },
      });
      if (!job) break;
      await prisma.aiEmbeddingJob.update({
        where: { id: job.id },
        data: {
          state: "PROCESSING",
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      try {
        await indexOne(job);
        completed += 1;
      } catch (error) {
        await prisma.aiEmbeddingJob.update({
          where: { id: job.id },
          data: {
            state: "FAILED",
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Errore di indicizzazione",
          },
        });
        break;
      }
    }
  } finally {
    indexing = false;
  }
  return completed;
}

export async function queueMissingEmbeddings(rebuild = false) {
  if (rebuild) await prisma.itemEmbeddingChunk.deleteMany({});
  const items = await prisma.item.findMany({
    where: { archivedAt: null, content: { not: "" } },
    select: { id: true, userId: true, version: true },
  });
  await prisma.$transaction(
    items.map((item) =>
      prisma.aiEmbeddingJob.upsert({
        where: { userId_itemId: { userId: item.userId, itemId: item.id } },
        create: {
          userId: item.userId,
          itemId: item.id,
          itemVersion: item.version,
        },
        update: {
          itemVersion: item.version,
          state: "PENDING",
          attempts: 0,
          lastError: null,
        },
      }),
    ),
  );
  return items.length;
}

export async function semanticSearch(
  userId: string,
  question: string,
  limit = 8,
): Promise<SemanticHit[]> {
  const vector = (
    await embed(
      process.env.OLLAMA_BASE_URL ?? "http://ollama:11434",
      process.env.OLLAMA_EMBEDDING_MODEL ?? "qwen3-embedding:0.6b",
      [question],
    )
  )[0];
  return prisma.$queryRaw<SemanticHit[]>(Prisma.sql`
    SELECT c."itemId" as "itemId", i."title", i."type"::text as "type", left(c."content", 240) as "excerpt", (1 - (c."embedding" <=> ${vector}::vector))::float as "rank"
    FROM "ItemEmbeddingChunk" c JOIN "Item" i ON i."id" = c."itemId" AND i."userId" = c."userId"
    WHERE c."userId" = ${userId} AND i."archivedAt" IS NULL
    ORDER BY c."embedding" <=> ${vector}::vector
    LIMIT ${Math.min(Math.max(limit, 1), 8)}
  `);
}

export async function indexStatus() {
  try {
    const [extension, chunks, pending] = await Promise.all([
      prisma.$queryRaw<{ present: boolean }[]>(
        Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present`,
      ),
      prisma.itemEmbeddingChunk.count(),
      prisma.aiEmbeddingJob.count({
        where: { state: { in: ["PENDING", "FAILED"] } },
      }),
    ]);
    return { available: Boolean(extension[0]?.present), chunks, pending };
  } catch {
    return { available: false, chunks: 0, pending: 0 };
  }
}
