import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db";
import {
  createItem,
  deleteItem,
  getItem,
  getDeletionPreview,
  listItems,
  updateItem,
} from "../src/server/items";
import { createRelation, deleteRelation } from "../src/server/relations";
import { createTag, listTags } from "../src/server/tags";
import { getDashboard } from "../src/server/dashboard";

const fixtureId = randomUUID();
let owner = "";
let outsider = "";

beforeAll(async () => {
  owner = (
    await prisma.user.create({
      data: {
        email: `integration-${fixtureId}@example.test`,
        name: "Integration owner",
      },
    })
  ).id;
  outsider = (
    await prisma.user.create({
      data: {
        email: `outsider-${fixtureId}@example.test`,
        name: "Other owner",
      },
    })
  ).id;
});
afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [owner, outsider].filter(Boolean) } },
  });
  await prisma.$disconnect();
});

describe("item lifecycle with the real PostgreSQL database", () => {
  it("captures, processes, tags, organizes, archives, restores, and safely deletes", async () => {
    const parent = await createItem(owner, {
      title: "Lifecycle project",
      type: "PROJECT",
      inbox: false,
    });
    const capture = await createItem(owner, { title: "Lifecycle idea" });
    expect(capture.inbox).toBe(true);
    const processed = await updateItem(owner, capture.id, {
      content: "A refined idea",
      inbox: false,
      tags: ["#Learning", "learning"],
      parentIds: [parent.id],
      version: capture.version,
    });
    expect(processed.tags).toHaveLength(1);
    expect(processed.outgoing[0].target.id).toBe(parent.id);
    expect(
      (await listItems(owner, { parent: parent.id })).items.some(
        (item) => item.id === capture.id,
      ),
    ).toBe(true);
    await updateItem(owner, capture.id, { archived: true });
    expect(
      (await listItems(owner, { archive: "archived" })).items.some(
        (item) => item.id === capture.id,
      ),
    ).toBe(true);
    await updateItem(owner, capture.id, { archived: false });
    await expect(deleteItem(owner, capture.id, "wrong")).rejects.toMatchObject({
      status: 400,
    });
    await deleteItem(owner, capture.id, capture.title);
    await expect(getItem(owner, capture.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      await prisma.itemRelation.count({ where: { sourceItemId: capture.id } }),
    ).toBe(0);
  });

  it("previews contained deletion without deleting shared resources", async () => {
    const area = await createItem(owner, { title: "Deletion area", type: "AREA", inbox: false });
    const otherArea = await createItem(owner, { title: "Shared parent", type: "AREA", inbox: false });
    const project = await createItem(owner, { title: "Deletion project", type: "PROJECT", parentIds: [area.id], inbox: false });
    const privateResource = await createItem(owner, { title: "Private resource", type: "RESOURCE", parentIds: [project.id], inbox: false });
    const sharedResource = await createItem(owner, { title: "Shared resource", type: "RESOURCE", parentIds: [project.id, otherArea.id], primaryParentId: project.id, inbox: false });
    const preview = await getDeletionPreview(owner, project.id, true);
    expect(preview.delete.map((entry) => entry.id)).toEqual(expect.arrayContaining([project.id, privateResource.id]));
    expect(preview.retained.find((entry) => entry.id === sharedResource.id)?.reason).toContain("Shared parent");
    await deleteItem(owner, project.id, project.title, { includeContained: true, planId: preview.planId });
    await expect(getItem(owner, privateResource.id)).rejects.toMatchObject({ status: 404 });
    expect((await getItem(owner, sharedResource.id)).id).toBe(sharedResource.id);
  });

  it("maintains backlinks, manual provenance, renames, and late target creation", async () => {
    const source = await createItem(owner, {
      title: "Wiki source",
      content: "[[Future target|read this]]",
    });
    expect(source.unresolvedWikilinks).toEqual(["Future target"]);
    const target = await createItem(owner, { title: "Future target" });
    let detail = await getItem(owner, target.id);
    expect(detail.incoming.map((edge) => edge.source.id)).toContain(source.id);
    const manual = await createRelation(owner, {
      sourceItemId: source.id,
      targetItemId: target.id,
      relationType: "REFERENCES",
    });
    expect(manual.manual && manual.wikilink).toBe(true);
    await updateItem(owner, target.id, { title: "Renamed target" });
    expect((await getItem(owner, source.id)).content).toBe(
      "[[Renamed target|read this]]",
    );
    await updateItem(owner, source.id, { content: "No more prose reference" });
    detail = await getItem(owner, target.id);
    expect(detail.incoming).toHaveLength(1);
    expect(detail.incoming[0]).toMatchObject({ manual: true, wikilink: false });
    await deleteRelation(owner, manual.id);
    expect((await getItem(owner, target.id)).incoming).toHaveLength(0);
    await updateItem(owner, source.id, { content: "[[Renamed target]]" });
    const wikiOnly = (await getItem(owner, target.id)).incoming[0];
    await expect(deleteRelation(owner, wikiOnly.id)).rejects.toMatchObject({
      status: 409,
    });
    await deleteItem(owner, target.id, "Renamed target");
    expect((await getItem(owner, source.id)).unresolvedWikilinks).toEqual([
      "Renamed target",
    ]);
    const recreated = await createItem(owner, { title: "Renamed target" });
    expect((await getItem(owner, recreated.id)).incoming).toHaveLength(1);
  });

  it("prevents duplicate identities, self-links, parent cycles, and invalid retyping", async () => {
    const area = await createItem(owner, { title: "Cycle area", type: "AREA" });
    const project = await createItem(owner, {
      title: "Cycle project",
      type: "PROJECT",
      parentIds: [area.id],
    });
    await expect(
      createItem(owner, { title: "  CYCLE  AREA " }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      createRelation(owner, {
        sourceItemId: area.id,
        targetItemId: area.id,
        relationType: "RELATED",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateItem(owner, area.id, { parentIds: [project.id] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateItem(owner, area.id, { type: "TASK" }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getItem(owner, area.id)).outgoing).toHaveLength(0);
  });

  it("does not expose or mutate another owner's items and enforces ownership in foreign keys", async () => {
    const privateItem = await createItem(outsider, {
      title: "Another person's note",
    });
    const ownItem = await createItem(owner, { title: "Own note" });
    await expect(getItem(owner, privateItem.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      updateItem(owner, privateItem.id, { title: "Intrusion" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deleteItem(owner, privateItem.id, privateItem.title),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createRelation(owner, {
        sourceItemId: ownItem.id,
        targetItemId: privateItem.id,
        relationType: "RELATED",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      prisma.itemRelation.create({
        data: {
          userId: owner,
          sourceItemId: ownItem.id,
          targetItemId: privateItem.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    const listed = await listItems(owner, { archive: "all", limit: 100 });
    expect(listed.items.some((item) => item.id === privateItem.id)).toBe(false);
  });

  it("enforces optimistic concurrency without losing an accepted update", async () => {
    const item = await createItem(owner, { title: "Concurrent note" });
    const results = await Promise.allSettled([
      updateItem(owner, item.id, { content: "first", version: item.version }),
      updateItem(owner, item.id, { content: "second", version: item.version }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("supports every item type and task completion/reopening", async () => {
    const task = await createItem(owner, {
      title: "Task lifecycle",
      type: "TASK",
    });
    expect(task.status).toBe("TODO");
    expect(
      (await updateItem(owner, task.id, { status: "DONE" })).completedAt,
    ).not.toBeNull();
    expect(
      (await updateItem(owner, task.id, { status: "IN_PROGRESS" })).completedAt,
    ).toBeNull();
    await expect(
      createItem(owner, { title: "Bad bookmark", type: "BOOKMARK" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (
        await createItem(owner, {
          title: "Valid bookmark",
          type: "BOOKMARK",
          url: "https://example.com",
        })
      ).url,
    ).toBe("https://example.com");
    expect(
      (await createItem(owner, { title: "Resource fixture", type: "RESOURCE" }))
        .type,
    ).toBe("RESOURCE");
    expect((await getDashboard(owner)).counts.tasks).toBeGreaterThan(0);
  });

  it("normalizes tags per owner and maintains FTS when content changes", async () => {
    const tag = await createTag(owner, "#Database");
    expect((await createTag(owner, "DATABASE")).id).toBe(tag.id);
    expect((await createTag(outsider, "database")).id).not.toBe(tag.id);
    const item = await createItem(owner, {
      title: "Search fixture",
      content: "Hippopotamus",
      tags: ["database"],
    });
    expect(
      (await listTags(owner)).find((entry) => entry.id === tag.id)?.count,
    ).toBe(1);
    const before = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Item" WHERE "userId"=${owner} AND "searchVector" @@ plainto_tsquery('simple', 'hippopotamus')`;
    expect(before.map((entry) => entry.id)).toContain(item.id);
    await updateItem(owner, item.id, { content: "Elephant" });
    const after = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Item" WHERE "userId"=${owner} AND "searchVector" @@ plainto_tsquery('simple', 'hippopotamus')`;
    expect(after).toHaveLength(0);
  });
});
