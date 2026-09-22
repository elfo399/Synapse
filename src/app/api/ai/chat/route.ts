import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { beginGeneration, completeGeneration, openOllamaStream, releaseGeneration } from "@/server/ai";
import { HttpError, json, readJson } from "@/server/http";

const inputSchema = z.object({ conversationId: z.string().min(1).max(128), message: z.string().trim().min(1).max(8_000) }).strict();
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readJson(request)); const user = await requireUser(request);
    const started = await beginGeneration(user.id, input.conversationId, input.message);
    const upstream = await openOllamaStream(started.conversation.mode, input.message, started.history, started.sources, request.signal);
    const encoder = new TextEncoder(); const decoder = new TextDecoder(); let answer = "";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader(); let pending = "";
        const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            pending += decoder.decode(chunk.value, { stream: true }); const lines = pending.split("\n"); pending = lines.pop() ?? "";
            for (const line of lines) { if (!line.trim()) continue; const part = JSON.parse(line) as { message?: { content?: string }; done?: boolean }; const token = part.message?.content ?? ""; if (token) { answer += token; send({ type: "token", token }); } }
          }
          await completeGeneration(started.conversation.id, answer, started.sources); send({ type: "done", sources: started.sources });
        } catch (error) { releaseGeneration(); send({ type: "error", error: error instanceof Error && error.name === "AbortError" ? "Generazione interrotta." : "La generazione si è interrotta." }); }
        finally { releaseGeneration(); reader.releaseLock(); controller.close(); }
      },
      async cancel() { releaseGeneration(); await upstream.cancel(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } });
  } catch (error) {
    releaseGeneration();
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Dati non validi." }, 400);
    return json({ error: "L’assistente non è disponibile." }, 502);
  }
}
