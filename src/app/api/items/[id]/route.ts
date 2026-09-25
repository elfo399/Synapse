import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getItem, moveItemToTrash, updateItem } from "@/server/items";
import { json, readJson, route } from "@/server/http";
import { idSchema } from "@/domain/validation";

type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    return json({
      item: await getItem(user.id, idSchema.parse((await context.params).id)),
    });
  });
export const PATCH = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    return json({
      item: await updateItem(
        user.id,
        idSchema.parse((await context.params).id),
        await readJson(request),
      ),
    });
  });
export const DELETE = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    const input = z
      .object({
        confirmed: z.literal(true),
        includeContained: z.boolean().optional(),
        planId: z.string().length(64).optional(),
      })
      .strict()
      .parse(await readJson(request));
    const result = await moveItemToTrash(
      user.id,
      idSchema.parse((await context.params).id),
      input.confirmed,
      { includeContained: input.includeContained, planId: input.planId },
    );
    return json({ success: true, ...result });
  });
