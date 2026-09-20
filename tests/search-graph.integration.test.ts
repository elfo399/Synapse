import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem, updateItem } from "@/server/items";
import { getGraph } from "@/server/graph";
import { searchItems } from "@/server/search";

describe("PostgreSQL search and bounded graph", () => {
  const userId = `graph-test-${randomUUID()}`;
  const otherId = `graph-other-${randomUUID()}`;
  let targetId: string;
  let sourceId: string;
  let projectId: string;
  beforeAll(async () => {
    await prisma.user.createMany({ data: [{ id: userId, email: `${userId}@example.test`, name: "Graph test" }, { id: otherId, email: `${otherId}@example.test`, name: "Other user" }] });
    projectId = (await createItem(userId, { title: "Research hub", type: "PROJECT", inbox: false })).id;
    targetId = (await createItem(userId, { title: "PostgreSQL", content: "Native full text search and durable backups", type: "RESOURCE", tags: ["DATABASE", "self-hosting"], parentIds: [projectId] })).id;
    sourceId = (await createItem(userId, { title: "Database design", content: "We chose [[PostgreSQL]] for durability and indexed retrieval.", type: "NOTE" })).id;
    await createItem(otherId, { title: "PostgreSQL confidential", content: "Unrelated private content" });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } }); await prisma.$disconnect(); });

  it("finds title prefixes, content and normalized tags without crossing owners", async () => {
    const title = await searchItems(userId, { q: "Postgre" });
    expect(title.items.map(item => item.id)).toContain(targetId);
    expect(title.items.some(item => item.title.includes("confidential"))).toBe(false);
    const content = await searchItems(userId, { q: '"indexed retrieval"' });
    expect(content.items.map(item => item.id)).toEqual([sourceId]);
    const tags = await searchItems(userId, { q: "self-hosting" });
    expect(tags.items.map(item => item.id)).toContain(targetId);
    expect(await searchItems(userId, { q: "'; DROP TABLE --" })).toMatchObject({ total: 0 });
  });
  it("keeps archived content searchable and connected", async () => {
    await updateItem(userId, targetId, { archived: true });
    expect((await searchItems(userId, { q: "PostgreSQL" })).items.find(item => item.id === targetId)?.archivedAt).toBeTruthy();
    expect((await searchItems(userId, { q: "PostgreSQL", archive: "active" })).items.some(item => item.id === targetId)).toBe(false);
    expect((await getGraph(userId, { archive: "all" })).edges.some(edge => edge.source === sourceId && edge.target === targetId)).toBe(true);
    await updateItem(userId, targetId, { archived: false });
  });
  it("returns bounded owner-scoped graph nodes and edges with honest truncation", async () => {
    const graph = await getGraph(userId, { limit: 1 });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.total).toBe(3);
    expect(graph.truncated).toBe(true);
    expect(graph.edges.every(edge => graph.nodes.some(node => node.id === edge.source) && graph.nodes.some(node => node.id === edge.target))).toBe(true);
    const complete = await getGraph(userId, {});
    expect(complete.nodes).toHaveLength(3);
    expect(complete.edges).toHaveLength(2);
  });
  it("filters tags, type, relation, parents and one-hop neighborhoods", async () => {
    expect((await getGraph(userId, { tag: "database" })).nodes.map(node => node.id)).toEqual([targetId]);
    expect((await getGraph(userId, { type: "NOTE" })).nodes.map(node => node.id)).toEqual([sourceId]);
    expect((await getGraph(userId, { parent: projectId })).nodes.map(node => node.id).sort()).toEqual([projectId, targetId].sort());
    expect((await getGraph(userId, { focus: sourceId })).nodes.map(node => node.id).sort()).toEqual([sourceId, targetId].sort());
    expect((await getGraph(userId, { relation: "REFERENCES" })).edges).toHaveLength(1);
    await expect(getGraph(otherId, { focus: targetId })).rejects.toMatchObject({ status: 404 });
  });
});
