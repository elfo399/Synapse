import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { idSchema } from "@/domain/validation";
import { json, route } from "@/server/http";

export const DELETE = (request: Request, context: { params: Promise<{ id: string; reminderId: string }> }) => route(async () => {
  const user = await requireUser(request);
  const { id, reminderId } = await context.params;
  await prisma.reminder.deleteMany({ where: { id: idSchema.parse(reminderId), itemId: idSchema.parse(id), userId: user.id, sentAt: null } });
  return json({ success: true });
});
