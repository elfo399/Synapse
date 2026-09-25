import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "../lib/validation";
import { prisma } from "../lib/db";
import {
  captureTitle,
  captureUrl,
  MAX_CAPTURE_FILES,
} from "../domain/attachments";
import { normalizeIdentity } from "../domain/normalization";
import { itemSchema } from "../domain/validation";
import { createItemInTransaction, getItem } from "./items";
import { assertMutationOrigin, HttpError } from "./http";
import { attachmentStorage, type StorageProvider } from "./storage";
import {
  attachmentLimit,
  safeFilename,
  validateUpload,
} from "./upload-validation";
import { withUserTransaction } from "./transactions";

const captureSchema = itemSchema.extend({
  title: z.string().trim().max(200).default(""),
  voice: z.boolean().default(false),
  duration: z.number().min(0).max(86400).optional(),
});
export type UploadFile = { name: string; type: string; bytes: Buffer };

export async function readUpload(request: Request) {
  assertMutationOrigin(request, "multipart/form-data");
  const limit = attachmentLimit() + 600_000;
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError(413, "Il caricamento supera il limite consentito.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Seleziona un file.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Il caricamento supera il limite consentito.");
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new HttpError(400, "Caricamento non valido.");
  }
  const entries = form.getAll("files");
  if (
    entries.length > MAX_CAPTURE_FILES ||
    entries.some((entry) => typeof entry === "string")
  )
    throw new HttpError(
      400,
      `Puoi caricare al massimo ${MAX_CAPTURE_FILES} file alla volta.`,
    );
  const files: UploadFile[] = await Promise.all(
    (entries as File[]).map(async (file) => ({
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    })),
  );
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") || "{}"));
  } catch {
    throw new HttpError(400, "Dati di cattura non validi.");
  }
  return { files, payload };
}

export async function drainAttachmentDeletions(
  storage: StorageProvider = attachmentStorage(),
) {
  for (const pending of await prisma.attachmentDeletion.findMany({
    take: 100,
    orderBy: { createdAt: "asc" },
  })) {
    try {
      await storage.delete(pending.storageKey);
      await prisma.attachmentDeletion.deleteMany({
        where: { storageKey: pending.storageKey },
      });
    } catch {
      console.error("Attachment cleanup deferred", {
        storageKey: pending.storageKey,
      });
    }
  }
}

export async function queueAttachmentDeletion(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
) {
  const files = await tx.attachment.findMany({
    where: { userId, itemId },
    select: { storageKey: true },
  });
  if (files.length)
    await tx.attachmentDeletion.createMany({
      data: files,
      skipDuplicates: true,
    });
}

async function storeUploads(
  files: UploadFile[],
  storage: StorageProvider,
  duration?: number,
) {
  if (
    files.length > MAX_CAPTURE_FILES ||
    files.reduce((total, file) => total + file.bytes.length, 0) >
      attachmentLimit()
  )
    throw new HttpError(
      413,
      "I file superano il limite totale di caricamento.",
    );
  const prepared = files.map((file) => ({
    originalName: safeFilename(file.name),
    mimeType: validateUpload(file.bytes, file.name, file.type),
    size: file.bytes.length,
    sha256: createHash("sha256").update(file.bytes).digest("hex"),
    storageKey: randomBytes(32).toString("hex"),
    bytes: file.bytes,
  }));
  const saved: string[] = [];
  try {
    for (const file of prepared) {
      await storage.save(file.storageKey, file.bytes);
      saved.push(file.storageKey);
    }
  } catch (error) {
    await compensate(saved, storage);
    throw error;
  }
  return prepared.map(({ bytes, ...file }) => {
    void bytes;
    return {
      ...file,
      duration: file.mimeType.startsWith("audio/") ? duration : undefined,
    };
  });
}

async function compensate(keys: string[], storage: StorageProvider) {
  for (const storageKey of keys) {
    try {
      await storage.delete(storageKey);
    } catch {
      await prisma.attachmentDeletion.upsert({
        where: { storageKey },
        create: { storageKey },
        update: {},
      });
    }
  }
}

export async function captureItem(
  userId: string,
  raw: unknown,
  files: UploadFile[] = [],
  storage: StorageProvider = attachmentStorage(),
) {
  const input = captureSchema.parse(raw);
  const detectedUrl = input.url || captureUrl(input.content);
  if (!input.title && !input.content.trim() && !detectedUrl && !files.length)
    throw new HttpError(400, "Scrivi un pensiero o aggiungi un file.");
  const voice =
    input.voice && files.some((file) => file.type.startsWith("audio/"));
  const suggested = captureTitle(
    detectedUrl && detectedUrl === captureUrl(input.content)
      ? ""
      : input.content,
    detectedUrl,
    files[0]?.name,
    voice,
  );
  const prepared = await storeUploads(files, storage, input.duration);
  try {
    return await withUserTransaction(userId, async (tx) => {
      let title = input.title || suggested;
      if (!input.title) {
        let suffix = 2;
        while (
          await tx.item.findFirst({
            where: {
              userId,
              titleNormalized: normalizeIdentity(title),
              deletedAt: null,
            },
            select: { id: true },
          })
        ) {
          title = `${suggested} (${suffix++})`;
          if (suffix > 1000)
            throw new HttpError(409, "Assegna un titolo a questa cattura.");
        }
      }
      const { voice, duration, ...itemInput } = input;
      void voice;
      void duration;
      const item = await createItemInTransaction(tx, userId, {
        ...itemInput,
        title,
        type: detectedUrl ? "BOOKMARK" : input.type,
        url: detectedUrl || input.url,
      });
      if (prepared.length)
        await tx.attachment.createMany({
          data: prepared.map((file) => ({ ...file, userId, itemId: item.id })),
        });
      return getItem(userId, item.id, tx);
    });
  } catch (error) {
    await compensate(
      prepared.map((file) => file.storageKey),
      storage,
    );
    throw error;
  }
}

export async function addAttachments(
  userId: string,
  itemId: string,
  files: UploadFile[],
  storage: StorageProvider = attachmentStorage(),
) {
  if (
    !(await prisma.item.findFirst({
      where: { userId, id: itemId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new HttpError(404, "Elemento non trovato.");
  if (!files.length) throw new HttpError(400, "Seleziona almeno un file.");
  const prepared = await storeUploads(files, storage);
  try {
    return await withUserTransaction(userId, async (tx) => {
      if (
        !(await tx.item.findFirst({
          where: { userId, id: itemId, deletedAt: null },
        }))
      )
        throw new HttpError(404, "Elemento non trovato.");
      if (
        (await tx.attachment.count({ where: { userId, itemId } })) +
          prepared.length >
        100
      )
        throw new HttpError(
          400,
          "Questo elemento contiene già troppi allegati (massimo 100).",
        );
      await tx.attachment.createMany({
        data: prepared.map((file) => ({ ...file, userId, itemId })),
      });
      return getItem(userId, itemId, tx);
    });
  } catch (error) {
    await compensate(
      prepared.map((file) => file.storageKey),
      storage,
    );
    throw error;
  }
}

export async function getAttachment(userId: string, id: string) {
  const file = await prisma.attachment.findFirst({
    where: { userId, id, item: { deletedAt: null } },
  });
  if (!file) throw new HttpError(404, "Allegato non trovato.");
  return file;
}

export async function deleteAttachment(
  userId: string,
  id: string,
  storage: StorageProvider = attachmentStorage(),
) {
  await withUserTransaction(userId, async (tx) => {
    const file = await tx.attachment.findFirst({
      where: { userId, id, item: { deletedAt: null } },
    });
    if (!file) throw new HttpError(404, "Allegato non trovato.");
    await tx.attachmentDeletion.create({
      data: { storageKey: file.storageKey },
    });
    await tx.attachment.delete({ where: { id: file.id } });
  });
  await drainAttachmentDeletions(storage);
}
