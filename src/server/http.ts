import { Prisma } from "@prisma/client";
import { z } from "../lib/validation";
import { HttpError } from "./errors";
import { getTrustedOrigins } from "../lib/origins";

export { HttpError } from "./errors";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function route(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Dati non validi." },
        400,
      );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return json(
          { error: "Esiste già un elemento o un’etichetta con questo nome." },
          409,
        );
      if (error.code === "P2025")
        return json({ error: "Questo elemento non esiste più." }, 404);
      if (error.code === "P2034")
        return json({ error: "È in corso un’altra modifica. Riprova." }, 409);
    }
    console.error("Request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Si è verificato un errore. Riprova." }, 500);
  }
}

export function assertMutationOrigin(
  request: Request,
  contentType = "application/json",
): void {
  const trustedOrigins = getTrustedOrigins(
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  );
  const origin = request.headers.get("origin");
  if (
    (origin && !trustedOrigins.includes(origin)) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new HttpError(403, "Questa richiesta non proviene da Synapse.");
  }
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(contentType)
  ) {
    throw new HttpError(415, "Formato della richiesta non valido.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  assertMutationOrigin(request);
  const maxBytes = 2_100_000;
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new HttpError(413, "Questo elemento è troppo grande.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new HttpError(400, "È richiesto un contenuto in formato JSON.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Questo elemento è troppo grande.");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "Contenuto JSON non valido.");
  }
}
