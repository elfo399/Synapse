import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { assertMutationOrigin, HttpError, json, route } from "@/server/http";
import { importArchive } from "@/server/transfers";

export const runtime = "nodejs";

export const POST = (request: Request) =>
  route(async () => {
    assertMutationOrigin(request, "multipart/form-data");
    if (Number(request.headers.get("content-length")) > 101 * 1024 * 1024)
      throw new HttpError(413, "L'archivio supera 100 MB.");
    const form = await request.formData().catch(() => {
      throw new HttpError(400, "Seleziona un archivio ZIP valido.");
    });
    const file = form.get("file");
    if (!(file instanceof File) || !file.size)
      throw new HttpError(400, "Seleziona un archivio ZIP.");
    if (file.size > 100 * 1024 * 1024)
      throw new HttpError(413, "L'archivio supera 100 MB.");
    const target = String(form.get("targetId") || "").trim();
    const result = await importArchive(
      (await requireUser(request)).id,
      new Uint8Array(await file.arrayBuffer()),
      target ? idSchema.parse(target) : undefined,
    );
    return json(result, 201);
  });
