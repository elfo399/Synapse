import { requireUser } from "@/lib/auth";
import { captureItem, readUpload } from "@/server/attachments";
import { attachmentLimit } from "@/server/upload-validation";
import { json, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const GET = (request: Request) =>
  route(async () => {
    await requireUser(request);
    return json({ maxAttachmentBytes: attachmentLimit(), maxFiles: 10 });
  });
export const POST = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    const { files, payload } = request.headers
      .get("content-type")
      ?.startsWith("multipart/form-data")
      ? await readUpload(request)
      : { files: [], payload: await readJson(request) };
    return json({ item: await captureItem(user.id, payload, files) }, 201);
  });
