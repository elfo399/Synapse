import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { listItemRevisions, restoreItemRevision } from "@/server/revisions";
import { json, readJson, route } from "@/server/http";
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => { const user = await requireUser(request); const params = new URL(request.url).searchParams; return json(await listItemRevisions(user.id, idSchema.parse((await context.params).id), Number(params.get("page") ?? 1), Math.min(50, Number(params.get("limit") ?? 20)))); });
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => { const user = await requireUser(request); const itemId = idSchema.parse((await context.params).id); const input = z.object({ revisionId: idSchema, version: z.number().int().positive() }).strict().parse(await readJson(request)); return json(await restoreItemRevision(user.id, itemId, input.revisionId, input.version)); });
