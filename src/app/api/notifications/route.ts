import { requireUser } from "@/lib/auth";
import { json, route } from "@/server/http";
import { prisma } from "@/lib/db";

export const GET = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const [notifications, unread] = await Promise.all([prisma.notification.findMany({ where: { userId: user.id }, include: { item: { select: { id: true, itemKey: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 50 }), prisma.notification.count({ where: { userId: user.id, readAt: null } })]);
  return json({ unread, notifications: notifications.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString(), readAt: entry.readAt?.toISOString() ?? null })) });
});
