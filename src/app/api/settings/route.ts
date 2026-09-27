import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { expiredTrashCount, getUserSettings, updateTrashRetention } from "@/server/user-settings";
import { json, readJson, route } from "@/server/http";
export const GET = (request: Request) => route(async () => { const user = await requireUser(request); const settings = await getUserSettings(user.id); return json({ settings, expiredOperations: await expiredTrashCount(user.id, settings.trashRetentionDays) }); });
export const PATCH = (request: Request) => route(async () => { const user = await requireUser(request); const input = z.object({ trashRetentionDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]), confirmed: z.boolean().optional() }).strict().parse(await readJson(request)); const expired = await expiredTrashCount(user.id, input.trashRetentionDays); if (expired && input.confirmed !== true) return json({ needsConfirmation: true, expiredOperations: expired }, 409); return json({ settings: await updateTrashRetention(user.id, input.trashRetentionDays), expiredOperations: expired }); });
