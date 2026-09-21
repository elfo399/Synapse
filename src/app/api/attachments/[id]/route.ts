import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { getAttachment, deleteAttachment } from "@/server/attachments";
import { attachmentStorage } from "@/server/storage";
import { json, readJson, route, HttpError } from "@/server/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    const file = await getAttachment(
      user.id,
      idSchema.parse((await context.params).id),
    );
    let bytes: Buffer;
    try {
      bytes = await attachmentStorage().read(file.storageKey);
    } catch {
      throw new HttpError(
        404,
        "Il file non è disponibile. Verifica il ripristino degli allegati.",
      );
    }
    const download =
      new URL(request.url).searchParams.has("download") ||
      file.mimeType.startsWith("text/");
    const name = encodeURIComponent(file.originalName).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16)}`,
    );
    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="allegato"; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Accept-Ranges": "bytes",
    };
    let start = 0;
    let end = bytes.length - 1;
    let status = 200;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
        });
      if (!match[1]) start = Math.max(0, bytes.length - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        start > end ||
        start >= bytes.length ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end)
      )
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
        });
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    return new Response(
      request.method === "HEAD"
        ? null
        : new Uint8Array(bytes.subarray(start, end + 1)),
      { status, headers },
    );
  });
export const HEAD = GET;
export const DELETE = (request: Request, context: Context) =>
  route(async () => {
    const user = await requireUser(request);
    await readJson(request);
    await deleteAttachment(user.id, idSchema.parse((await context.params).id));
    return json({ success: true });
  });
