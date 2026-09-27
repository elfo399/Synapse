import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { queueGeneration } from "@/server/ai";
import { HttpError, json, readJson } from "@/server/http";

const inputSchema = z.object({
  conversationId: z.string().min(1).max(128),
  message: z.string().trim().min(1).max(8_000),
  webSearch: z.boolean(),
  reasoning: z.boolean(),
  idempotencyKey: z.string().min(12).max(128),
}).strict();

// This endpoint only persists a job. The independent worker owns planning and
// the Ollama stream, so a disconnected browser cannot cancel a generation.
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readJson(request));
    const user = await requireUser(request);
    const generation = await queueGeneration({
      userId: user.id,
      conversationId: input.conversationId,
      content: input.message,
      options: { webSearch: input.webSearch, reasoning: input.reasoning },
      idempotencyKey: input.idempotencyKey,
    });
    return json({ generation }, 202);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Dati non validi." }, 400);
    return json({ error: "Assistente non disponibile." }, 502);
  }
}