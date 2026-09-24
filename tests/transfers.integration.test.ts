import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { prisma } from "../src/lib/db";
import { createItem, getItem } from "../src/server/items";
import {
  exportArchive,
  exportReadableArchive,
  importArchive,
} from "../src/server/transfers";
import type { StorageProvider } from "../src/server/storage";

class MemoryStorage implements StorageProvider {
  objects = new Map<string, Buffer>();
  async save(key: string, bytes: Uint8Array) {
    this.objects.set(key, Buffer.from(bytes));
  }
  async read(key: string) {
    const value = this.objects.get(key);
    if (!value) throw new Error("missing object");
    return value;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
}

const fixture = randomUUID().slice(0, 8);
const storage = new MemoryStorage();
let owner = "";
let importer = "";
let areaId = "";

beforeAll(async () => {
  owner = (
    await prisma.user.create({
      data: {
        email: `transfer-owner-${fixture}@example.test`,
        name: "Transfer owner",
      },
    })
  ).id;
  importer = (
    await prisma.user.create({
      data: {
        email: `transfer-import-${fixture}@example.test`,
        name: "Transfer import",
      },
    })
  ).id;
  const area = await createItem(owner, {
    title: `Area export ${fixture}`,
    type: "AREA",
    inbox: false,
  });
  const project = await createItem(owner, {
    title: `Progetto export ${fixture}`,
    type: "PROJECT",
    inbox: false,
    parentIds: [area.id],
  });
  const resource = await createItem(owner, {
    title: `Risorsa multimediale ${fixture}`,
    type: "RESOURCE",
    inbox: false,
    parentIds: [project.id],
    tags: ["condivisione"],
  });
  await createItem(owner, {
    title: `Attività export ${fixture}`,
    type: "TASK",
    status: "IN_PROGRESS",
    inbox: false,
    dueAt: "2026-10-01T12:00:00.000Z",
    parentIds: [project.id],
  });
  const key = randomBytes(32).toString("hex");
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await storage.save(key, image);
  const attachment = await prisma.attachment.create({
    data: {
      userId: owner,
      itemId: resource.id,
      originalName: "immagine prova.png",
      storageKey: key,
      mimeType: "image/png",
      size: image.length,
      sha256: createHash("sha256").update(image).digest("hex"),
    },
  });
  await prisma.resourceBlock.createMany({
    data: [
      {
        userId: owner,
        resourceId: resource.id,
        type: "TEXT",
        position: 0,
        text: "# Appunti\n\nContenuto da leggere offline.",
      },
      {
        userId: owner,
        resourceId: resource.id,
        type: "IMAGE",
        position: 1,
        attachmentId: attachment.id,
      },
      {
        userId: owner,
        resourceId: resource.id,
        type: "AUDIO",
        position: 2,
        attachmentId: attachment.id,
      },
      {
        userId: owner,
        resourceId: resource.id,
        type: "LINK",
        position: 3,
        url: "https://example.com",
      },
    ],
  });
  areaId = area.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [owner, importer].filter(Boolean) } },
  });
  await prisma.$disconnect();
});

describe("Synapse exports", () => {
  it("keeps the native archive reimportable and rejects readable archives", async () => {
    const native = await exportArchive(owner, areaId, storage);
    const entries = unzipSync(native);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining(["manifest.json", "items.json", "relations.json"]),
    );
    expect(
      Object.keys(entries).some((entry) => entry.startsWith("assets/")),
    ).toBe(true);
    const imported = await importArchive(importer, native, undefined, storage);
    const root = await getItem(importer, imported.itemId);
    expect(root.type).toBe("AREA");
    expect(
      await prisma.resourceBlock.count({ where: { userId: importer } }),
    ).toBeGreaterThan(0);
    const readable = await exportReadableArchive(owner, areaId, storage);
    await expect(
      importArchive(importer, readable, undefined, storage),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("formato leggibile"),
    });
  });

  it("creates an offline HTML and Markdown collection with relative assets", async () => {
    const readable = await exportReadableArchive(owner, areaId, storage);
    const entries = unzipSync(readable);
    const names = Object.keys(entries);
    expect(names).toContain("index.html");
    expect(names).toContain("README.txt");
    expect(names.some((name) => /^projects\/.*\/index\.html$/.test(name))).toBe(
      true,
    );
    const markdown = names.find((name) => /resources\/.*\.md$/.test(name));
    expect(markdown).toBeTruthy();
    expect(
      names.some(
        (name) => name.startsWith("assets/") && !/[a-z0-9]{20,}/i.test(name),
      ),
    ).toBe(true);
    const markdownText = new TextDecoder().decode(entries[markdown!]);
    expect(markdownText).toContain("Contenuto da leggere offline.");
    expect(markdownText).toMatch(/\]\((\.\.\/)+assets\//);
    const projectPage = names.find((name) =>
      /^projects\/.*\/index\.html$/.test(name),
    );
    expect(new TextDecoder().decode(entries[projectPage!])).toContain(
      "Attività export",
    );
  });
});
