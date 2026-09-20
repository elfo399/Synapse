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
    await prisma.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.test`, name: "Graph test" },
        { id: otherId, email: `${otherId}@example.test`, name: "Other user" },
      ],
    });
    projectId = (
      await createItem(userId, {
        title: "Research hub",
        type: "PROJECT",
        inbox: false,
      })
    ).id;
    targetId = (
      await createItem(userId, {
        title: "PostgreSQL",
        content: "Native full text search and durable backups",
        type: "RESOURCE",
        tags: ["DATABASE", "self-hosting"],
        parentIds: [projectId],
      })
    ).id;
    sourceId = (
      await createItem(userId, {
        title: "Database design",
        content:
          "We chose [[PostgreSQL]] for **durability** and [indexed retrieval](https://example.test/search).",
        type: "NOTE",
      })
    ).id;
    await createItem(otherId, {
      title: "PostgreSQL confidential",
      content: "Unrelated private content",
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("finds title prefixes, content and normalized tags without crossing owners", async () => {
    const title = await searchItems(userId, { q: "Postgre" });
    expect(title.items.map((item) => item.id)).toContain(targetId);
    expect(
      title.items.some((item) => item.title.includes("confidential")),
    ).toBe(false);
    const content = await searchItems(userId, { q: '"indexed retrieval"' });
    expect(content.items.map((item) => item.id)).toEqual([sourceId]);
    expect(content.items[0].snippet).toContain("indexed retrieval");
    expect(content.items[0].snippet).not.toMatch(
      /StartSel|StopSel|<\/?b>|\[\[|\]\]|\*\*|\]\(/,
    );
    const wikilink = title.items.find((item) => item.id === sourceId);
    expect(wikilink?.snippet).toContain("PostgreSQL");
    expect(wikilink?.snippet).not.toMatch(/StartSel|StopSel|<\/?b>|\[\[|\]\]/);
    const tags = await searchItems(userId, { q: "self-hosting" });
    expect(tags.items.map((item) => item.id)).toContain(targetId);
    expect(await searchItems(userId, { q: "'; DROP TABLE --" })).toMatchObject({
      total: 0,
    });
  });
  it("keeps archived content searchable and connected", async () => {
    await updateItem(userId, targetId, { archived: true });
    expect(
      (await searchItems(userId, { q: "PostgreSQL" })).items.find(
        (item) => item.id === targetId,
      )?.archivedAt,
    ).toBeTruthy();
    expect(
      (
        await searchItems(userId, { q: "PostgreSQL", archive: "active" })
      ).items.some((item) => item.id === targetId),
    ).toBe(false);
    expect(
      (await getGraph(userId, { archive: "all" })).edges.some(
        (edge) => edge.source === sourceId && edge.target === targetId,
      ),
    ).toBe(true);
    await updateItem(userId, targetId, { archived: false });
  });
  it("removes wikilink delimiters when a headline truncates before the closing brackets", async () => {
    const item = await createItem(otherId, {
      title: "Sintesi progressiva",
      content:
        "Conserva il contesto originale, poi rendi più facile ritrovare le parti utili.\n\n**Livello 1:** Raccogli.\n**Livello 2:** Evidenzia.\n**Livello 3:** Riassumi con parole tue.\n\nCollega il risultato alle [[Note atomiche]].",
      type: "NOTE",
    });
    const result = await searchItems(otherId, { q: "note" });
    const snippet = result.items.find((hit) => hit.id === item.id)?.snippet;
    expect(snippet).toContain("Note atomiche");
    expect(snippet).not.toMatch(/\[\[|\]\]/);
  });
  it("returns bounded owner-scoped graph nodes and edges with honest truncation", async () => {
    const graph = await getGraph(userId, { limit: 1 });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.total).toBe(3);
    expect(graph.truncated).toBe(true);
    expect(
      graph.edges.every(
        (edge) =>
          graph.nodes.some((node) => node.id === edge.source) &&
          graph.nodes.some((node) => node.id === edge.target),
      ),
    ).toBe(true);
    const complete = await getGraph(userId, {});
    expect(complete.nodes).toHaveLength(3);
    expect(complete.edges).toHaveLength(2);
  });
  it("expands local neighborhoods up to three levels while preserving ownership and bounds", async () => {
    const nearby = await getGraph(userId, { focus: sourceId, depth: 1 });
    expect(nearby.nodes.map((node) => node.id).sort()).toEqual(
      [sourceId, targetId].sort(),
    );
    const expanded = await getGraph(userId, { focus: sourceId, depth: 2 });
    expect(expanded.nodes.map((node) => node.id).sort()).toEqual(
      [sourceId, targetId, projectId].sort(),
    );
    expect(
      (await getGraph(userId, { focus: sourceId, depth: 3 })).nodes,
    ).toHaveLength(3);
    const bounded = await getGraph(userId, {
      focus: sourceId,
      depth: 3,
      limit: 1,
    });
    expect(bounded.nodes).toHaveLength(1);
    expect(bounded.truncated).toBe(true);
    await expect(
      getGraph(otherId, { focus: sourceId, depth: 3 }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getGraph(userId, { focus: sourceId, depth: 4 }),
    ).rejects.toThrow();
  });
  it("filters tags, type, relation, parents and one-hop neighborhoods", async () => {
    expect(
      (await getGraph(userId, { tag: "database" })).nodes.map(
        (node) => node.id,
      ),
    ).toEqual([targetId]);
    expect(
      (await getGraph(userId, { type: "NOTE" })).nodes.map((node) => node.id),
    ).toEqual([sourceId]);
    expect(
      (await getGraph(userId, { parent: projectId })).nodes
        .map((node) => node.id)
        .sort(),
    ).toEqual([projectId, targetId].sort());
    expect(
      (await getGraph(userId, { focus: sourceId })).nodes
        .map((node) => node.id)
        .sort(),
    ).toEqual([sourceId, targetId].sort());
    expect(
      (await getGraph(userId, { relation: "REFERENCES" })).edges,
    ).toHaveLength(1);
    await expect(getGraph(otherId, { focus: targetId })).rejects.toMatchObject({
      status: 404,
    });
  });
  it("expands local depth through both directions, bounds results and enforces ownership", async () => {
    const branch = await createItem(userId, {
      title: "Third level context",
      type: "NOTE",
      parentIds: [projectId],
    });
    try {
      const ids = async (depth: number) =>
        (await getGraph(userId, { focus: sourceId, depth })).nodes
          .map((node) => node.id)
          .sort();
      expect(await ids(1)).toEqual([sourceId, targetId].sort());
      expect(await ids(2)).toEqual([sourceId, targetId, projectId].sort());
      expect(await ids(3)).toEqual(
        [sourceId, targetId, projectId, branch.id].sort(),
      );
      expect(
        (await getGraph(userId, { focus: sourceId, depth: 3, limit: 2 }))
          .truncated,
      ).toBe(true);
      expect(
        (
          await getGraph(userId, {
            focus: sourceId,
            depth: 3,
            relation: "REFERENCES",
          })
        ).nodes
          .map((node) => node.id)
          .sort(),
      ).toEqual([sourceId, targetId].sort());
      await expect(
        getGraph(otherId, { focus: sourceId, depth: 3 }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        getGraph(userId, { focus: sourceId, depth: 4 }),
      ).rejects.toThrow();
    } finally {
      await prisma.item.delete({ where: { id: branch.id } });
    }
  });
});
