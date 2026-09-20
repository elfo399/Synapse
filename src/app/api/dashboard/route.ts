import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/server/dashboard";
import { json, route } from "@/server/http";
export const GET = (request: Request) => route(async () => json(await getDashboard((await requireUser(request)).id)));
