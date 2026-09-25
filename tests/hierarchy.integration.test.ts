import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createItem,
  getDeletionPreview,
  getItem,
  moveItemToTrash,
  updateItem,
} from "@/server/items";
import { createRelation, setPrimaryParent } from "@/server/relations";

describe("area, project and resource hierarchy", () => {
  const userId = `hierarchy-${randomUUID()}`;
  const otherUserId = `hierarchy-other-${randomUUID()}`;
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Hierarchy owner",
        },
        {
          id: otherUserId,
          email: `${otherUserId}@example.test`,
          name: "Other owner",
        },
      ],
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await prisma.$disconnect();
  });

  it("keeps a real Area → Project → Resource path and unified resource content", async () => {
    const area = await createItem(userId, {
      title: "Informatica",
      type: "AREA",
      inbox: false,
    });
    const project = await createItem(userId, {
      title: "Synapse hierarchy",
      type: "PROJECT",
      inbox: false,
      parentIds: [area.id],
    });
    const resource = await createItem(userId, {
      title: "Documentazione tecnica",
      type: "RESOURCE",
      inbox: false,
      parentIds: [project.id],
    });
    const note = await createItem(userId, {
      title: "Schema Markdown",
      content: "# Struttura",
      inbox: false,
      parentIds: [resource.id],
    });
    const bookmark = await createItem(userId, {
      title: "Documentazione Prisma",
      type: "BOOKMARK",
      url: "https://www.prisma.io/docs",
      inbox: false,
      parentIds: [resource.id],
    });
    const detail = await getItem(userId, resource.id);
    expect(
      (await getItem(userId, project.id)).outgoing.find(
        (relation) => relation.relationType === "PARENT",
      )?.target.id,
    ).toBe(area.id);
    expect(
      detail.outgoing.find((relation) => relation.relationType === "PARENT")
        ?.target.id,
    ).toBe(project.id);
    expect(
      detail.incoming
        .filter((relation) => relation.relationType === "PARENT")
        .map((relation) => relation.source.id)
        .sort(),
    ).toEqual([note.id, bookmark.id].sort());
    expect(
      detail.incoming.every((relation) => relation.source.id !== detail.id),
    ).toBe(true);
  });

  it("uses one primary parent while preserving secondary contexts", async () => {
    const firstArea = await createItem(userId, {
      title: "Area primaria",
      type: "AREA",
    });
    const secondArea = await createItem(userId, {
      title: "Area secondaria",
      type: "AREA",
    });
    const resource = await createItem(userId, {
      title: "Risorsa con contesti",
      type: "RESOURCE",
      parentIds: [firstArea.id, secondArea.id],
    });
    let parents = (await getItem(userId, resource.id)).outgoing.filter(
      (relation) => relation.relationType === "PARENT",
    );
    expect(
      parents
        .filter((relation) => relation.isPrimary)
        .map((relation) => relation.target.id),
    ).toEqual([firstArea.id]);
    const secondary = parents.find(
      (relation) => relation.target.id === secondArea.id,
    )!;
    await setPrimaryParent(userId, secondary.id);
    parents = (await getItem(userId, resource.id)).outgoing.filter(
      (relation) => relation.relationType === "PARENT",
    );
    expect(
      parents
        .filter((relation) => relation.isPrimary)
        .map((relation) => relation.target.id),
    ).toEqual([secondArea.id]);
  });

  it("rejects invalid structures and keeps children when a container is removed", async () => {
    const area = await createItem(userId, {
      title: "Area removibile",
      type: "AREA",
    });
    const project = await createItem(userId, {
      title: "Progetto indipendente",
      type: "PROJECT",
      parentIds: [area.id],
    });
    const resource = await createItem(userId, {
      title: "Risorsa indipendente",
      type: "RESOURCE",
      parentIds: [project.id],
    });
    await expect(
      createRelation(userId, {
        sourceItemId: area.id,
        targetItemId: project.id,
        relationType: "PARENT",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createRelation(userId, {
        sourceItemId: project.id,
        targetItemId: resource.id,
        relationType: "PARENT",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const preview = await getDeletionPreview(userId, area.id, false);
    await moveItemToTrash(userId, area.id, area.title, {
      planId: preview.planId,
    });
    expect((await getItem(userId, project.id)).id).toBe(project.id);
    expect((await getItem(userId, resource.id)).id).toBe(resource.id);
    await expect(
      updateItem(otherUserId, resource.id, { primaryParentId: project.id }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
