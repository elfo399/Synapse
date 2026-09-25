import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { abortGeneration, beginAutomaticGeneration, completeGeneration, openRoutedOllamaStream } from "@/server/ai";
import { HttpError, json, readJson } from "@/server/http";

const inputSchema = z.object({
  conversationId: z.string().min(1).max(128),
  message: z.string().trim().min(1).max(8_000),
  webSearch: z.boolean(),
  reasoning: z.boolean(),
}).strict();

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
};

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readJson(request));
    const user = await requireUser(request);
    const started = await beginAutomaticGeneration({
      userId: user.id,
      conversationId: input.conversationId,
      content: input.message,
      options: { webSearch: input.webSearch, reasoning: input.reasoning },
    });
    const upstream = await openRoutedOllamaStream(
      started.strategy,
      input.message,
      started.history,
      started.sources,
      request.signal,
      Boolean(started.options.reasoning),
      started.toolContext,
    );

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let answer = "";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        let pending = "";
        const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          const phase = started.strategy === "KNOWLEDGE"
            ? "searching_knowledge"
            : started.strategy === "WEB" || started.strategy === "COMBINED"
              ? "searching_web"
              : "generating";
          send({ type: "status", phase });
          if (started.options.reasoning) send({ type: "status", phase: "reasoning" });
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            pending += decoder.decode(chunk.value, { stream: true });
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const part = JSON.parse(line) as { message?: { content?: string } };
              const token = part.message?.content ?? "";
              if (token) {
                answer += token;
                send({ type: "token", token });
              }
            }
          }
          const completed = await completeGeneration({
            conversationId: started.conversation.id,
            content: answer,
            sources: started.sources,
          });
          send({ type: "done", sources: completed.sources });
        } catch (error) {
          abortGeneration();
          send({
            type: "error",
            error: error instanceof Error && error.name === "AbortError"
              ? "Generazione interrotta."
              : "La generazione si è interrotta.",
          });
        } finally {
          abortGeneration();
          reader.releaseLock();
          controller.close();
        }
      },
      async cancel() {
        abortGeneration();
        await upstream.cancel();
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    abortGeneration();
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Dati non validi." }, 400);
    return json({ error: "L’assistente non è disponibile." }, 502);
  }
}
