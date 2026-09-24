import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { beginAutomaticGeneration, completeGeneration, openRoutedOllamaStream, releaseGeneration } from "@/server/ai";
import { HttpError, json, readJson } from "@/server/http";

const inputSchema = z.object({ conversationId: z.string().min(1).max(128), message: z.string().trim().min(1).max(8_000), webSearch: z.boolean(), reasoning: z.boolean() }).strict();
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readJson(request)); const user = await requireUser(request);
    const options = { webSearch: input.webSearch, reasoning: input.reasoning };
    const started = await beginAutomaticGeneration(user.id, input.conversationId, input.message, options);
    if (started.direct) {
      const sources = await completeGeneration(started.conversation.id, started.direct, started.sources, options); releaseGeneration();
      const payload = `data: ${JSON.stringify({ type: "status", phase: "generating" })}\n\ndata: ${JSON.stringify({ type: "token", token: started.direct })}\n\ndata: ${JSON.stringify({ type: "done", sources })}\n\n`;
      return new Response(payload, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } });
    }
    const upstream = await openRoutedOllamaStream(started.strategy, input.message, started.history, started.sources, request.signal, options.reasoning);
    const encoder = new TextEncoder(); const decoder = new TextDecoder(); let answer = "";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader(); let pending = "";
        const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          send({ type: "status", phase: started.strategy === "LOCAL" ? "searching_knowledge" : started.strategy === "WEB" ? "searching_web" : started.strategy === "COMBINED" ? "searching_web" : "generating" }); if (started.strategy === "WEB" || started.strategy === "COMBINED") send({ type: "web", count: started.webCount }); send({ type: "status", phase: options.reasoning ? "reasoning" : "generating" });
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            pending += decoder.decode(chunk.value, { stream: true }); const lines = pending.split("\n"); pending = lines.pop() ?? "";
            for (const line of lines) { if (!line.trim()) continue; const part = JSON.parse(line) as { message?: { content?: string; thinking?: string }; done?: boolean }; const token = part.message?.content ?? ""; if (token) { answer += token; send({ type: "token", token }); } }
          }
          const cited = await completeGeneration(started.conversation.id, answer, started.sources, options); send({ type: "done", sources: cited });
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
