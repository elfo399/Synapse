import { requireUser } from "@/lib/auth";
import { getDeletionPreview } from "@/server/items";
import { json, route } from "@/server/http";
import { idSchema } from "@/domain/validation";

type Context = { params: Promise<{ id: string }> };

export const GET = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    const includeContained = new URL(request.url).searchParams.get("includeContained") === "true";
    return json({ preview: await getDeletionPreview(user.id, idSchema.parse((await context.params).id), includeContained) });
  });
