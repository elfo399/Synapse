import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createTag, listTags } from "@/server/tags";
import { json, readJson, route } from "@/server/http";

export const GET = (request: Request) => route(async () => json({ tags: await listTags((await requireUser(request)).id) }));
export const POST = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const input = z.object({ name: z.string() }).strict().parse(await readJson(request));
  return json({ tag: await createTag(user.id, input.name) }, 201);
});
