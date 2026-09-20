import { describe, expect, it } from "vitest";
import { normalizeIdentity, normalizeTag } from "../src/domain/normalization";
import { extractWikiLinks, renameWikiLinks } from "../src/domain/wikilinks";
import { defaultStatus, itemPatchSchema, itemQuerySchema, itemSchema, statusAllowed, tagSchema } from "../src/domain/validation";
import { assertMutationOrigin, readJson } from "../src/server/http";

describe("knowledge identity", () => {
  it("normalizes Unicode, spacing, and case consistently", () => {
    expect(normalizeIdentity("  Ｄocker   Compose  ")).toBe("docker compose");
    expect(normalizeTag(" #BACKUP ")).toBe("backup");
    expect(tagSchema.parse("#Database")).toBe("database");
    expect(tagSchema.safeParse("<script>").success).toBe(false);
  });
});

describe("wikilinks", () => {
  it("deduplicates target identity and supports a display alias", () => {
    const links = extractWikiLinks("[[Docker]] and [[docker|containers]] and [[ PostgreSQL ]] and [[missing]]");
    expect(links.map((link) => link.normalized)).toEqual(["docker", "postgresql", "missing"]);
    expect(links[0].alias).toBe("containers");
  });
  it("ignores escaped links and fenced/inline code", () => {
    const content = "\\[[Escaped]] `[[Inline]]`\n```md\n[[Fenced]]\n```\n~~~\n[[Also code]]\n~~~\n[[Real]]";
    expect(extractWikiLinks(content).map((link) => link.title)).toEqual(["Real"]);
  });
  it("renames prose references while preserving aliases and code", () => {
    expect(renameWikiLinks("[[Docker]] [[docker|engine]] `[[Docker]]`", "docker", "Containers"))
      .toBe("[[Containers]] [[Containers|engine]] `[[Docker]]`");
  });
  it("ignores invalid or excessively long links", () => {
    expect(extractWikiLinks(`[[ ]] [[${"a".repeat(201)}]]`)).toEqual([]);
  });
});

describe("boundary validation", () => {
  it("defaults a quick capture to an inbox note without metadata", () => {
    expect(itemSchema.parse({ title: "An idea" })).toMatchObject({ title: "An idea", type: "NOTE", inbox: true, content: "", tags: [], parentIds: [] });
  });
  it("does not fill omitted fields in partial updates", () => {
    expect(itemPatchSchema.parse({ inbox: false })).toEqual({ inbox: false });
  });
  it("rejects unknown ownership fields and unsafe bookmark protocols", () => {
    expect(itemSchema.safeParse({ title: "x", userId: "another-owner" }).success).toBe(false);
    expect(itemSchema.safeParse({ title: "x", url: "javascript:alert(1)" }).success).toBe(false);
    expect(itemSchema.safeParse({ title: "x", url: "https://example.com" }).success).toBe(true);
  });
  it("bounds pagination and content", () => {
    expect(itemQuerySchema.safeParse({ limit: "1000" }).success).toBe(false);
    expect(itemQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
    expect(itemSchema.safeParse({ title: "x", content: "a".repeat(500_001) }).success).toBe(false);
  });
  it("keeps task and project statuses appropriate", () => {
    expect(defaultStatus("TASK")).toBe("TODO");
    expect(statusAllowed("NOTE", "DONE")).toBe(false);
    expect(statusAllowed("TASK", "DONE")).toBe(true);
    expect(statusAllowed("PROJECT", "ON_HOLD")).toBe(true);
  });
  it("rejects cross-site mutations and non-JSON content", () => {
    expect(() => assertMutationOrigin(new Request("http://localhost:3000/api/items", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" } }))).toThrow();
    expect(() => assertMutationOrigin(new Request("http://localhost:3000/api/items", { method: "POST", headers: { "content-type": "text/plain" } }))).toThrow();
  });
  it("reports malformed JSON as a client error", async () => {
    const request = new Request("http://localhost:3000/api/items", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    await expect(readJson(request)).rejects.toMatchObject({ status: 400 });
  });
});
