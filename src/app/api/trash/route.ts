import { ItemType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/server/http";
import { getEmptyTrashPreview, listTrash } from "@/server/trash";

export const GET = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const rawType = url.searchParams.get("type") || undefined;
    const type =
      rawType && Object.values(ItemType).includes(rawType as ItemType)
        ? (rawType as ItemType)
        : undefined;
    return json({
      operations: await listTrash(user.id, {
        q: url.searchParams.get("q")?.trim() || undefined,
        type,
      }),
      summary: await getEmptyTrashPreview(user.id),
    });
  });
