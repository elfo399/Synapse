import { describe, expect, it } from "vitest";
import { aiConfig, buildSystemPrompt, DEFAULT_OLLAMA_MODEL, SYNAPSE_IDENTITY_PROMPT } from "@/server/ai";

describe("configurazione Ollama", () => {
  it("usa un unico prompt identitario per la risposta finale", () => {
    expect(buildSystemPrompt("DIRECT", [])).toContain(SYNAPSE_IDENTITY_PROMPT);
  });

  it("usa Qwen3 1.7B come modello predefinito", () => {
    expect(aiConfig().model).toBe(DEFAULT_OLLAMA_MODEL);
  });
});
