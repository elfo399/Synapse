import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { addAttachments, readUpload } from "@/server/attachments";
import { json, route } from "@/server/http";

export const runtime = "nodejs";
export const POST = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  route(async () => {
    const user = await requireUser(request);
    const { files } = await readUpload(request);
    return json(
      {
        item: await addAttachments(
          user.id,
          idSchema.parse((await context.params).id),
          files,
        ),
      },
      201,
    );
  });
