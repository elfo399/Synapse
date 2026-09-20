import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createRelation, deleteRelation, listRelations } from "@/server/relations";
import { json, readJson, route } from "@/server/http";
import { idSchema, relationSchema } from "@/domain/validation";

export const GET = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const itemId = idSchema.optional().parse(new URL(request.url).searchParams.get("itemId") ?? undefined);
  return json({ relations: await listRelations(user.id, itemId) });
});
export const POST = (request: Request) => route(async () => {
  const user = await requireUser(request);
  return json({ relation: await createRelation(user.id, relationSchema.parse(await readJson(request))) }, 201);
});
export const DELETE = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const input = z.object({ id: idSchema }).strict().parse(await readJson(request));
  await deleteRelation(user.id, input.id);
  return json({ success: true });
});
