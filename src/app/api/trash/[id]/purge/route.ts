import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { json, readJson, route } from "@/server/http";
import { purgeTrashOperation } from "@/server/trash";
type Context = { params: Promise<{ id: string }> };
export const POST = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    const body = z
      .object({
        confirmed: z.literal(true),
        planId: z.string().length(64),
      })
      .strict()
      .parse(await readJson(request));
    await purgeTrashOperation(
      user.id,
      idSchema.parse((await context.params).id),
      body.confirmed,
      body.planId,
    );
    return json({ success: true });
  });
