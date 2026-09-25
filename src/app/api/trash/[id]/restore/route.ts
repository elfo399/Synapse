import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { json, readJson, route } from "@/server/http";
import { restoreTrashOperation } from "@/server/trash";
type Context = { params: Promise<{ id: string }> };
export const POST = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    const body = z
      .object({ itemId: z.string().optional() })
      .strict()
      .parse(await readJson(request));
    return json(
      await restoreTrashOperation(
        user.id,
        idSchema.parse((await context.params).id),
        body.itemId,
      ),
    );
  });
