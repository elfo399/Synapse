import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeIdentity } from "../src/domain/normalization";
import { extractWikiLinks } from "../src/domain/wikilinks";
import { itemSchema, statusAllowed } from "../src/domain/validation";
import type { ItemStatus, ItemType } from "../src/domain/types";

interface PackItem {
  slug: string;
  title: string;
  type: ItemType;
  status?: ItemStatus;
  tags: string[];
  url?: string;
  parentSlugs: string[];
  content: string;
}

interface KnowledgePack {
  id: string;
  version: string;
  source: { repository: string; ref: string; capturedAt: string };
  items: PackItem[];
}

async function loadArcadiaPack(): Promise<KnowledgePack> {
  const url = new URL(
    "../scripts/knowledge-packs/arcadia.json",
    import.meta.url,
  );
  return JSON.parse(await readFile(url, "utf8")) as KnowledgePack;
}

describe("Arcadia knowledge pack", () => {
  it("contains the complete curated system map", async () => {
    const pack = await loadArcadiaPack();
    expect(pack.id).toBe("arcadia");
    expect(pack.source.repository).toBe("https://github.com/elfo399/Arcadia");
    expect(pack.source.ref).toMatch(/^[0-9a-f]{40}$/);
    expect(pack.items.length).toBeGreaterThanOrEqual(34);
  });

  it("uses unique valid slugs, titles, and Synapse item inputs", async () => {
    const pack = await loadArcadiaPack();
    const slugs = new Set<string>();
    const titles = new Set<string>();

    for (const item of pack.items) {
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
      expect(slugs.has(item.slug)).toBe(false);
      slugs.add(item.slug);

      const normalizedTitle = normalizeIdentity(item.title);
      expect(titles.has(normalizedTitle)).toBe(false);
      titles.add(normalizedTitle);

      expect(
        itemSchema.safeParse({
          title: item.title,
          content: item.content,
          type: item.type,
          status: item.status,
          inbox: false,
          tags: item.tags,
          url: item.url ?? null,
          parentIds: [],
          archived: false,
        }).success,
      ).toBe(true);

      if (item.status) expect(statusAllowed(item.type, item.status)).toBe(true);
    }
  });

  it("resolves every parent and has no parent cycles", async () => {
    const pack = await loadArcadiaPack();
    const bySlug = new Map(pack.items.map((item) => [item.slug, item]));

    for (const item of pack.items)
      for (const parent of item.parentSlugs) expect(bySlug.has(parent)).toBe(true);

    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (slug: string) => {
      if (visited.has(slug)) return;
      expect(visiting.has(slug)).toBe(false);
      visiting.add(slug);
      const item = bySlug.get(slug);
      expect(item).toBeDefined();
      for (const parent of item?.parentSlugs ?? []) visit(parent);
      visiting.delete(slug);
      visited.add(slug);
    };

    for (const item of pack.items) visit(item.slug);
    expect(visited.size).toBe(pack.items.length);
  });

  it("resolves every wikilink inside the pack", async () => {
    const pack = await loadArcadiaPack();
    const titles = new Set(pack.items.map((item) => normalizeIdentity(item.title)));
    const unresolved: string[] = [];

    for (const item of pack.items)
      for (const link of extractWikiLinks(item.content))
        if (!titles.has(link.normalized))
          unresolved.push(item.title + " -> " + link.title);

    expect(unresolved).toEqual([]);
  });
});
