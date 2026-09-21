import { requireUser } from "@/lib/auth";
import { getGraph } from "@/server/graph";
import { json, route } from "@/server/http";

export const GET = (request: Request) =>
  route(async () => {
    const user = await requireUser(request);
    return json(
      await getGraph(
        user.id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  });
