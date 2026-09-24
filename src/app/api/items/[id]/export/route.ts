import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { exportArchive, exportReadableArchive } from "@/server/transfers";
import { route } from "@/server/http";

export const runtime = "nodejs";

export const GET = (
  request: Request,
  context: RouteContext<"/api/items/[id]/export">,
) =>
  route(async () => {
    const user = await requireUser(request);
    const id = idSchema.parse((await context.params).id);
    const readable =
      new URL(request.url).searchParams.get("format") === "readable";
    const archive = readable
      ? await exportReadableArchive(user.id, id)
      : await exportArchive(user.id, id);
    return new Response(
      archive.buffer.slice(
        archive.byteOffset,
        archive.byteOffset + archive.byteLength,
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${readable ? "synapse-consultabile" : "synapse-archivio"}-${id.slice(0, 12)}.zip"`,
          "Cache-Control": "no-store",
        },
      },
    );
  });
