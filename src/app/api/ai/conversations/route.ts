import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { createConversation, listConversations } from "@/server/ai";
import { json, readJson, route } from "@/server/http";

const createSchema = z.object({ mode: z.enum(["KNOWLEDGE", "GENERAL", "WEB", "COMBINED"]).default("KNOWLEDGE"), title: z.string().trim().max(160).optional(), webSearch: z.boolean().optional(), reasoning: z.boolean().optional() }).strict();
export const GET = (request: Request) => route(async () => json({ conversations: await listConversations((await requireUser(request)).id) }));
export const POST = (request: Request) => route(async () => {
  const input = createSchema.parse(await readJson(request)); const user = await requireUser(request);
  return json({ conversation: await createConversation(user.id, input.mode, input.title, { webSearch: input.webSearch, reasoning: input.reasoning }) }, 201);
});
