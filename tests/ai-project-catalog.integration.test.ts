import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { beginAutomaticGeneration, completeGeneration, projectCatalogResponse } from "@/server/ai";
import { createItem } from "@/server/items";

const fixture = randomUUID();
let ownerId = "";
let outsiderId = "";

beforeAll(async () => {
  ownerId = (await prisma.user.create({ data: { email: `ai-project-owner-${fixture}@example.test`, name: "AI project owner" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `ai-project-outsider-${fixture}@example.test`, name: "AI project outsider" } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe("catalogo progetti dell'Assistente", () => {
  it("usa Prisma per restituire tutti i progetti dell'utente, anche senza descrizione", async () => {
    const alpha = await createItem(ownerId, { title: `Catalogo Alfa ${fixture}`, type: "PROJECT", content: "Descrizione Alfa", inbox: false });
    const beta = await createItem(ownerId, { title: `Catalogo Beta ${fixture}`, type: "PROJECT", inbox: false });
    const gamma = await createItem(ownerId, { title: `Catalogo Gamma ${fixture}`, type: "PROJECT", content: "Descrizione Gamma", inbox: false });
    const privateProject = await createItem(outsiderId, { title: `Privato ${fixture}`, type: "PROJECT", inbox: false });

    const result = await projectCatalogResponse(ownerId, "Abbiamo dei progetti?");

    expect(result?.content).toContain(alpha.title);
    expect(result?.content).toContain(beta.title);
    expect(result?.content).toContain(gamma.title);
    expect(result?.content).not.toContain(privateProject.title);
    const hrefs = result?.sources.map((source) => source.href) ?? [];
    for (const project of [alpha, beta, gamma]) {
      expect(hrefs.some((href) => href.endsWith(`--${project.id}`))).toBe(true);
    }
  });

  it("risponde senza Web e conserva fonti e collegamenti nella conversazione", async () => {
    const conversation = await prisma.aiConversation.create({ data: { userId: ownerId, title: "Catalogo progetti" } });
    const started = await beginAutomaticGeneration(ownerId, conversation.id, "Mostrami tutti i progetti.", { webSearch: false, reasoning: false });

    expect(started.strategy).toBe("LOCAL");
    expect(started.direct).toContain("Catalogo Alfa");
    expect(started.sources).toHaveLength(3);

    const persisted = await completeGeneration(conversation.id, started.direct!, started.sources, { webSearch: false, reasoning: false });
    expect(persisted.every((source) => source.usage === "CITED")).toBe(true);
  });
});
