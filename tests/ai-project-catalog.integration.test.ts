import { describe, expect, it } from "vitest";
import { SYNAPSE_IDENTITY_PROMPT, buildSystemPrompt } from "@/server/ai";

describe("catalogo progetti dell'Assistente", () => {
  it("mantiene il prompt centrale per le risposte che usano strumenti", () => {
    expect(buildSystemPrompt("KNOWLEDGE", [])).toContain(SYNAPSE_IDENTITY_PROMPT);
  });
});
