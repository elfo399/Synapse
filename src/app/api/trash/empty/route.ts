import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { json, readJson, route } from "@/server/http";
import { emptyTrash } from "@/server/trash";

export const POST = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    const body = z
      .object({ confirm: z.string(), planId: z.string().length(64) })
      .strict()
      .parse(await readJson(request));
    await emptyTrash(user.id, body.confirm, body.planId);
    return json({ success: true });
  });
