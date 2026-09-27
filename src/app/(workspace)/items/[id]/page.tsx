import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getItemHref, getItemId } from "@/domain/item-url";
import { ItemDetail } from "@/features/items/item-detail";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: segment } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const item = await prisma.item.findFirst({
    where: {
      userId: session.user.id,
      OR: [
        { id: getItemId(segment) },
        { itemKey: { equals: segment.trim().toUpperCase() } },
      ],
    },
    select: { id: true, title: true, itemKey: true },
  });
  if (!item) notFound();
  const canonical = getItemHref(item);
  // Temporary redirect: titles can change again; bookmarks always resolve by ID.
  if (`/items/${segment}` !== canonical) redirect(canonical);
  return <ItemDetail id={item.id} />;
}
