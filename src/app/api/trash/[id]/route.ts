import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { json, route } from "@/server/http";
import { getTrashPurgePreview } from "@/server/trash";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    return json({
      preview: await getTrashPurgePreview(
        user.id,
        idSchema.parse((await context.params).id),
      ),
    });
  });
