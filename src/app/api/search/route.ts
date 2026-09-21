import { requireUser } from "@/lib/auth";
import { searchItems } from "@/server/search";
import { json, route } from "@/server/http";

export const GET = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    return json(
      await searchItems(
        user.id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  });
