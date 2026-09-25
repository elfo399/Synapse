import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { itemSchema } from "../src/domain/validation";

describe("resource unification", () => {
  it("creates a resource by default and keeps the enum free of NOTE", () => {
    expect(itemSchema.parse({ title: "Raccolta" }).type).toBe("RESOURCE");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).not.toMatch(/enum ItemType \{\s*NOTE/);
  });
  it("migrates existing notes in place and schedules only converted embeddings", () => {
    const migration = readFileSync("prisma/migrations/20260926090000_unify_notes_as_resources/migration.sql", "utf8");
    expect(migration).toContain("SET \"type\" = 'RESOURCE'");
    expect(migration).toContain("WHERE \"type\" = 'NOTE'");
    expect(migration).toContain('INSERT INTO "AiEmbeddingJob"');
  });
});
