import { requireUser } from "@/lib/auth";
import { deleteTimeBlock, updateTimeBlock } from "@/server/planner";
import { assertMutationOrigin, json, readJson, route } from "@/server/http";
export const PATCH = (request: Request, { params }: { params: Promise<{ id: string }> }) => route(async () => json({ block: await updateTimeBlock((await requireUser(request)).id, (await params).id, await readJson(request)) }));
export const DELETE = (request: Request, { params }: { params: Promise<{ id: string }> }) => route(async () => { assertMutationOrigin(request, ""); await deleteTimeBlock((await requireUser(request)).id, (await params).id); return new Response(null, { status: 204 }); });
