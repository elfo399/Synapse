import { requireUser } from "@/lib/auth";
import { getGeneration } from "@/server/ai";

type Context = { params: Promise<{ id: string }> };
const headers = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function GET(request: Request, context: Context) {
  const user = await requireUser(request);
  const id = (await context.params).id;
  await getGeneration(user.id, id);
  const encoder = new TextEncoder();
  let closed = false;
  let last = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = async () => {
        const generation = await getGeneration(user.id, id);
        const marker = `${generation.updatedAt.toISOString()}:${generation.state}:${generation.content.length}`;
        if (marker !== last) { last = marker; controller.enqueue(encoder.encode(`event: generation\ndata: ${JSON.stringify(generation)}\n\n`)); }
        if (["COMPLETED", "FAILED", "INTERRUPTED", "CANCELED"].includes(generation.state)) { closed = true; controller.close(); }
      };
      await send();
      while (!closed && !request.signal.aborted) { await new Promise((resolve) => setTimeout(resolve, 900)); await send(); }
      if (!closed) controller.close();
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers });
}