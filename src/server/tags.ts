import { prisma } from "../lib/db";
import { tagSchema } from "../domain/validation";

export async function listTags(userId: string) {
  const tags = await prisma.tag.findMany({
    where: { userId },
    include: {
      _count: { select: { items: { where: { item: { deletedAt: null } } } } },
    },
    orderBy: { name: "asc" },
  });
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    count: tag._count.items,
  }));
}

export async function createTag(userId: string, rawName: unknown) {
  const name = tagSchema.parse(rawName);
  const tag = await prisma.tag.upsert({
    where: { userId_normalizedName: { userId, normalizedName: name } },
    create: { userId, name, normalizedName: name },
    update: {},
    include: {
      _count: { select: { items: { where: { item: { deletedAt: null } } } } },
    },
  });
  return { id: tag.id, name: tag.name, count: tag._count.items };
}
