import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listAssistantItems } from "@/server/ai";
import { createItem } from "@/server/items";

const fixture = randomUUID();
let ownerId = "";
let outsiderId = "";

beforeAll(async () => {
  ownerId = (await prisma.user.create({ data: { email: `ai-owner-${fixture}@example.test`, name: "AI owner" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `ai-outsider-${fixture}@example.test`, name: "AI outsider" } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe("catalogo strutturato dell'Assistente", () => {
  it("restituisce tutti i progetti dell'utente, inclusi quelli senza descrizione", async () => {
    const alpha = await createItem(ownerId, { title: `Alfa ${fixture}`, type: "PROJECT", content: "Descrizione", inbox: false });
    const beta = await createItem(ownerId, { title: `Beta ${fixture}`, type: "PROJECT", inbox: false });
    const gamma = await createItem(ownerId, { title: `Gamma ${fixture}`, type: "PROJECT", inbox: false });
    const privateProject = await createItem(outsiderId, { title: `Privato ${fixture}`, type: "PROJECT", inbox: false });

    const result = await listAssistantItems(ownerId, "PROJECT", 2);

    expect(result).toMatchObject({ state: "ok", itemType: "PROJECT", total: 3, truncated: true });
    expect(result.items).toHaveLength(2);
    expect(result.sources.map((source) => source.href)).not.toContain(expect.stringContaining(privateProject.id));
    expect(result.sources.every((source) => source.href?.includes("--"))).toBe(true);
    expect([alpha.id, beta.id, gamma.id]).toContain(result.items[0]?.id);
  });

  it("non trasforma un tipo errato in un elenco globale", async () => {
    await expect(listAssistantItems(ownerId, "ALL", 25)).resolves.toMatchObject({ state: "invalid_type", items: [], sources: [] });
  });
});
