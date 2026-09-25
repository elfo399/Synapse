import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  captureItem,
  addAttachments,
  deleteAttachment,
  getAttachment,
  drainAttachmentDeletions,
} from "@/server/attachments";
import { getItem, moveItemToTrash, updateItem } from "@/server/items";
import { getTrashPurgePreview, purgeTrashOperation } from "@/server/trash";
import { LocalFilesystemStorage, type StorageProvider } from "@/server/storage";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
  "base64",
);
const image = { name: "photo.png", type: "image/png", bytes: png };
describe("Private durable attachments and universal capture", () => {
  const owner = `capture-${randomUUID()}`;
  const other = `capture-${randomUUID()}`;
  let root: string;
  let storage: LocalFilesystemStorage;
  let oldPath: string | undefined;
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "synapse-upload-"));
    storage = new LocalFilesystemStorage(root);
    oldPath = process.env.ATTACHMENT_STORAGE_PATH;
    process.env.ATTACHMENT_STORAGE_PATH = root;
    await prisma.user.createMany({
      data: [owner, other].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: "Capture test",
      })),
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    // This unique temporary directory was created by this suite, never user storage.
    await rm(root, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env.ATTACHMENT_STORAGE_PATH;
    else process.env.ATTACHMENT_STORAGE_PATH = oldPath;
    await prisma.$disconnect();
  });
  it("captures titleless text and duplicate titles without losing content", async () => {
    const first = await captureItem(owner, { content: "Un pensiero utile" });
    const second = await captureItem(owner, { content: "Un pensiero utile" });
    expect(first).toMatchObject({
      title: "Un pensiero utile",
      content: "Un pensiero utile",
      inbox: true,
      type: "RESOURCE",
    });
    expect(second.title).toBe("Un pensiero utile (2)");
  });
  it("stores URLs without fetching remote or private endpoints", async () => {
    const item = await captureItem(owner, {
      content: "http://127.0.0.1:9/private",
    });
    expect(item).toMatchObject({
      type: "BOOKMARK",
      url: "http://127.0.0.1:9/private",
      inbox: true,
    });
  });
  it("stores an image privately, enforces owner access, preserves it through archive and cleans up on delete", async () => {
    const item = await captureItem(owner, {}, [image]);
    const attachment = item.attachments![0];
    const file = await getAttachment(owner, attachment.id);
    expect(attachment).toMatchObject({
      originalName: "photo.png",
      mimeType: "image/png",
      size: png.length,
    });
    expect(attachment).not.toHaveProperty("storageKey");
    expect(await storage.read(file.storageKey)).toEqual(png);
    await expect(getAttachment(other, attachment.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteAttachment(other, attachment.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(addAttachments(other, item.id, [image])).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      prisma.attachment.create({
        data: {
          userId: other,
          itemId: item.id,
          originalName: "bad.png",
          mimeType: "image/png",
          size: png.length,
          storageKey: "f".repeat(64),
          sha256: file.sha256,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await updateItem(owner, item.id, { archived: true });
    expect((await getItem(owner, item.id)).attachments).toHaveLength(1);
    await updateItem(owner, item.id, { archived: false });
    expect(await storage.exists(file.storageKey)).toBe(true);
    const moved = await moveItemToTrash(owner, item.id, item.title);
    expect(await storage.exists(file.storageKey)).toBe(true);
    const preview = await getTrashPurgePreview(owner, moved.operationId);
    await purgeTrashOperation(
      owner,
      moved.operationId,
      item.title,
      preview.planId,
    );
    expect(await storage.exists(file.storageKey)).toBe(false);
    await expect(getAttachment(owner, attachment.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("supports audio/documents and standalone attachment removal", async () => {
    const wav = Buffer.alloc(48);
    wav.write("RIFF");
    wav.writeUInt32LE(40, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(4, 40);
    const item = await captureItem(owner, { voice: true, duration: 1 }, [
      { name: "memo.wav", type: "audio/wav", bytes: wav },
    ]);
    expect(item.title).toContain("Memo vocale");
    const updated = await addAttachments(owner, item.id, [
      { name: "note.md", type: "text/markdown", bytes: Buffer.from("# Nota") },
      {
        name: "file.pdf",
        type: "application/pdf",
        bytes: Buffer.from("%PDF-1.4\n%%EOF"),
      },
    ]);
    expect(updated.attachments).toHaveLength(3);
    const file = await getAttachment(owner, updated.attachments![0].id);
    await deleteAttachment(owner, file.id);
    expect(await storage.exists(file.storageKey)).toBe(false);
    expect((await getItem(owner, item.id)).attachments).toHaveLength(2);
    await moveItemToTrash(owner, item.id, item.title);
  });
  it("compensates DB failure and rejects bad files before creating items", async () => {
    await captureItem(owner, { title: "Existing" });
    const before = await readdir(path.join(root, "objects"));
    await expect(
      captureItem(owner, { title: "Existing" }, [image]),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await readdir(path.join(root, "objects"))).toEqual(before);
    const count = await prisma.item.count({ where: { userId: owner } });
    await expect(
      captureItem(owner, { title: "Invalid image" }, [
        { ...image, bytes: Buffer.from("not an image") },
      ]),
    ).rejects.toMatchObject({ status: 415 });
    const broken: StorageProvider = {
      save: async () => {
        throw new Error("Disk full");
      },
      read: (key) => storage.read(key),
      delete: (key) => storage.delete(key),
      exists: (key) => storage.exists(key),
    };
    await expect(
      captureItem(owner, { title: "Disk failure" }, [image], broken),
    ).rejects.toThrow("Disk full");
    expect(await prisma.item.count({ where: { userId: owner } })).toBe(count);
  });
  it("retries filesystem deletion after a committed metadata deletion", async () => {
    const item = await captureItem(owner, { title: "Retry cleanup" }, [image]);
    const file = await getAttachment(owner, item.attachments![0].id);
    const broken: StorageProvider = {
      save: (key, bytes) => storage.save(key, bytes),
      read: (key) => storage.read(key),
      exists: (key) => storage.exists(key),
      delete: async () => {
        throw new Error("Temporarily unavailable");
      },
    };
    await deleteAttachment(owner, file.id, broken);
    expect(
      await prisma.attachmentDeletion.findUnique({
        where: { storageKey: file.storageKey },
      }),
    ).not.toBeNull();
    await drainAttachmentDeletions(storage);
    expect(await storage.exists(file.storageKey)).toBe(false);
    expect(
      await prisma.attachmentDeletion.findUnique({
        where: { storageKey: file.storageKey },
      }),
    ).toBeNull();
  });
});
