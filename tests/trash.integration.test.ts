import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createItem,
  getDeletionPreview,
  getItem,
  listItems,
  moveItemToTrash,
} from "@/server/items";
import {
  listTrash,
  purgeTrashOperation,
  restoreTrashOperation,
} from "@/server/trash";

const suffix = randomUUID();
let owner = "";
let other = "";

beforeAll(async () => {
  owner = (
    await prisma.user.create({
      data: {
        email: `trash-owner-${suffix}@example.test`,
        name: "Trash owner",
      },
    })
  ).id;
  other = (
    await prisma.user.create({
      data: {
        email: `trash-other-${suffix}@example.test`,
        name: "Trash other",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [owner, other].filter(Boolean) } },
  });
  await prisma.$disconnect();
});

describe("Cestino recuperabile", () => {
  it("nasconde una risorsa, ne conserva i dati e ripristina il suo stato di archivio", async () => {
    const resource = await createItem(owner, {
      title: "Risorsa archiviata nel cestino",
      type: "RESOURCE",
      content: "Contenuto da conservare",
      archived: true,
    });
    const moved = await moveItemToTrash(owner, resource.id, resource.title);
    await expect(getItem(owner, resource.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await listItems(owner, { archive: "archived" })).items.some(
        (item) => item.id === resource.id,
      ),
    ).toBe(false);
    expect(
      (await listTrash(owner)).find(
        (operation) => operation.id === moved.operationId,
      )?.items[0],
    ).toMatchObject({ id: resource.id, archivedAt: expect.any(String) });
    await restoreTrashOperation(owner, moved.operationId);
    expect(await getItem(owner, resource.id)).toMatchObject({
      content: "Contenuto da conservare",
      archivedAt: expect.any(String),
    });
  });

  it("raggruppa gli elementi esclusivi e conserva quelli condivisi", async () => {
    const area = await createItem(owner, {
      title: "Area cestino",
      type: "AREA",
      inbox: false,
    });
    const otherArea = await createItem(owner, {
      title: "Area condivisa cestino",
      type: "AREA",
      inbox: false,
    });
    const project = await createItem(owner, {
      title: "Progetto cestino",
      type: "PROJECT",
      parentIds: [area.id],
      inbox: false,
    });
    const privateResource = await createItem(owner, {
      title: "Risorsa privata cestino",
      type: "RESOURCE",
      parentIds: [project.id],
      inbox: false,
    });
    const sharedResource = await createItem(owner, {
      title: "Risorsa condivisa cestino",
      type: "RESOURCE",
      parentIds: [project.id, otherArea.id],
      inbox: false,
    });
    const preview = await getDeletionPreview(owner, project.id, true);
    const moved = await moveItemToTrash(owner, project.id, project.title, {
      includeContained: true,
      planId: preview.planId,
    });
    const group = (await listTrash(owner)).find(
      (operation) => operation.id === moved.operationId,
    )!;
    expect(group.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([project.id, privateResource.id]),
    );
    await expect(getItem(owner, privateResource.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await getItem(owner, sharedResource.id)).id).toBe(
      sharedResource.id,
    );
    await restoreTrashOperation(owner, moved.operationId);
    expect((await getItem(owner, privateResource.id)).title).toBe(
      privateResource.title,
    );
  });

  it("non ripristina n? elimina il Cestino di un altro utente e segnala un conflitto di titolo", async () => {
    const original = await createItem(owner, {
      title: "Titolo in conflitto",
      type: "RESOURCE",
    });
    const moved = await moveItemToTrash(owner, original.id, original.title);
    await createItem(owner, { title: "Titolo in conflitto", type: "RESOURCE" });
    await expect(
      restoreTrashOperation(other, moved.operationId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      restoreTrashOperation(owner, moved.operationId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("elimina fisicamente soltanto dal Cestino con un piano aggiornato", async () => {
    const item = await createItem(owner, {
      title: "Purge dal cestino",
      type: "TASK",
    });
    const moved = await moveItemToTrash(owner, item.id, item.title);
    const operation = (await listTrash(owner)).find(
      (entry) => entry.id === moved.operationId,
    )!;
    const { getTrashPurgePreview } = await import("@/server/trash");
    const preview = await getTrashPurgePreview(owner, operation.id);
    await expect(
      purgeTrashOperation(owner, operation.id, "titolo errato", preview.planId),
    ).rejects.toMatchObject({ status: 400 });
    await purgeTrashOperation(owner, operation.id, item.title, preview.planId);
    expect(await prisma.item.findUnique({ where: { id: item.id } })).toBeNull();
  });
});
