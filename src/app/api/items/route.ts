import { requireUser } from "@/lib/auth";
import { createItem, listItems } from "@/server/items";
import { json, readJson, route } from "@/server/http";

export const GET = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    return json(
      await listItems(
        user.id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  });

export const POST = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    return json(
      { item: await createItem(user.id, await readJson(request)) },
      201,
    );
  });
