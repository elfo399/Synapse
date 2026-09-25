import { prisma } from "../lib/db";
import { itemInclude, serializeItem } from "./serialization";

export async function getDashboard(userId: string) {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const active = { userId, archivedAt: null, deletedAt: null };
  const openStatuses = ["TODO", "IN_PROGRESS"] as const;
  const [
    inbox,
    tasks,
    projects,
    resources,
    todayTasks,
    activeProjects,
    recentItems,
  ] = await prisma.$transaction([
    prisma.item.count({ where: { ...active, inbox: true } }),
    prisma.item.count({
      where: { ...active, type: "TASK", status: { in: [...openStatuses] } },
    }),
    prisma.item.count({
      where: {
        ...active,
        type: "PROJECT",
        status: { notIn: ["DONE", "CANCELLED"] },
      },
    }),
    prisma.item.count({ where: { ...active, type: "RESOURCE" } }),
    prisma.item.findMany({
      where: {
        ...active,
        type: "TASK",
        status: { in: [...openStatuses] },
        OR: [{ dueAt: { lt: tomorrow } }, { dueAt: null }],
      },
      orderBy: [
        { dueAt: { sort: "asc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
      take: 8,
      include: itemInclude,
    }),
    prisma.item.findMany({
      where: {
        ...active,
        type: "PROJECT",
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: itemInclude,
    }),
    prisma.item.findMany({
      where: active,
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: itemInclude,
    }),
  ]);
  return {
    counts: { inbox, tasks, projects, resources },
    todayTasks: todayTasks.map(serializeItem),
    activeProjects: activeProjects.map(serializeItem),
    recentItems: recentItems.map(serializeItem),
  };
}
