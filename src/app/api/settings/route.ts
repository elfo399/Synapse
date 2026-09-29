import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { expiredTrashCount, getUserSettings, updateTrashRetention, updateUserSettings } from "@/server/user-settings";
import { json, readJson, route } from "@/server/http";
export const GET = (request: Request) => route(async () => { const user = await requireUser(request); const settings = await getUserSettings(user.id); return json({ settings, expiredOperations: await expiredTrashCount(user.id, settings.trashRetentionDays) }); });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const PATCH = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const input = z.object({ trashRetentionDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]).optional(), confirmed: z.boolean().optional(), timezone: z.string().min(1).max(64).optional(), remindersEnabled: z.boolean().optional(), browserNotificationsEnabled: z.boolean().optional(), defaultReminderTime: time.optional(), weeklyReviewDay: z.number().int().min(1).max(7).optional(), weeklyReviewTime: time.optional(), quietHoursStart: time.nullable().optional(), quietHoursEnd: time.nullable().optional() }).strict().parse(await readJson(request));
  if (input.trashRetentionDays !== undefined) { const expired = await expiredTrashCount(user.id, input.trashRetentionDays); if (expired && input.confirmed !== true) return json({ needsConfirmation: true, expiredOperations: expired }, 409); return json({ settings: await updateTrashRetention(user.id, input.trashRetentionDays), expiredOperations: expired }); }
  const { confirmed: _confirmed, ...settings } = input;
  return json({ settings: await updateUserSettings(user.id, settings), expiredOperations: 0 });
});
