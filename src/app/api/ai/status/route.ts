import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/server/ai";
import { json, route } from "@/server/http";

export const GET = (request: Request) => route(async () => {
  await requireUser(request);
  return json(await aiStatus());
});
