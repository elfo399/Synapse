import { describe, expect, it } from "vitest";
import { graphQuerySchema } from "@/server/graph";
import { searchQuerySchema } from "@/server/search";

describe("query boundaries", () => {
  it("bounds graph size and rejects invalid filters", () => {
    expect(graphQuerySchema.parse({}).limit).toBe(500);
    for (const input of [
      { limit: 0 },
      { limit: 1501 },
      { limit: "not-a-number" },
      { type: "USER" },
      { archive: "yes" },
    ])
      expect(graphQuerySchema.safeParse(input).success).toBe(false);
  });
  it("bounds search pages, query size and result sets", () => {
    for (const input of [{ page: -1 }, { limit: 51 }, { q: "a".repeat(201) }])
      expect(searchQuerySchema.safeParse(input).success).toBe(false);
    expect(searchQuerySchema.parse({ q: " hello " })).toMatchObject({
      q: "hello",
      archive: "all",
      limit: 20,
    });
  });
});
