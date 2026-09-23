import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig, DEFAULT_OLLAMA_MODEL, openOllamaStream } from "@/server/ai";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  vi.unstubAllGlobals();
});

describe("configurazione Ollama", () => {
  it("usa Qwen3 1.7B come modello predefinito", () => {
    delete process.env.OLLAMA_MODEL;

    expect(aiConfig().model).toBe(DEFAULT_OLLAMA_MODEL);
  });

  it("invia a Qwen3 think: false mantenendo lo streaming", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://ollama.test:11434";
    process.env.OLLAMA_MODEL = "qwen3:1.7b";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"done":true}\n'));
    vi.stubGlobal("fetch", fetchMock);

    await openOllamaStream(
      "KNOWLEDGE",
      "Quali note ho?",
      [],
      [],
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama.test:11434/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject(
      {
        model: "qwen3:1.7b",
        stream: true,
        think: false,
      },
    );
  });

  it("mantiene il payload compatibile con Llama 3.2", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://ollama.test:11434";
    process.env.OLLAMA_MODEL = "llama3.2:3b";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"done":true}\n'));
    vi.stubGlobal("fetch", fetchMock);

    await openOllamaStream(
      "GENERAL",
      "Ciao",
      [],
      [],
      new AbortController().signal,
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload).toMatchObject({ model: "llama3.2:3b", stream: true });
    expect(payload).not.toHaveProperty("think");
  });

  it("permette di attivare il ragionamento per Qwen3", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://ollama.test:11434";
    process.env.OLLAMA_MODEL = "qwen3:1.7b";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"done":true}\n'));
    vi.stubGlobal("fetch", fetchMock);

    await openOllamaStream(
      "GENERAL",
      "Rifletti prima di rispondere",
      [],
      [],
      new AbortController().signal,
      true,
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      think: true,
    });
  });
});
