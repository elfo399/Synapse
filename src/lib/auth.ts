import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { headers } from "next/headers";
import { prisma } from "./db";
import { getTrustedOrigins } from "./origins";
import { HttpError } from "../server/errors";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const secret = process.env.BETTER_AUTH_SECRET;
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (!process.env.BETTER_AUTH_URL)
    throw new Error("BETTER_AUTH_URL must be configured.");
  const url = new URL(baseURL);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside localhost.");
  }
}

export const auth = betterAuth({
  appName: "Synapse",
  baseURL,
  secret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  plugins: [username({ displayUsername: false })],
  disabledPaths: ["/is-username-available"],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  trustedOrigins: getTrustedOrigins(baseURL),
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  advanced: {
    useSecureCookies: new URL(baseURL).protocol === "https:",
    cookiePrefix: "secondbrain",
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  telemetry: { enabled: false },
});

export async function getSession(request?: Request) {
  return auth.api.getSession({
    headers: request?.headers ?? (await headers()),
  });
}

export async function requireUser(request?: Request) {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "Accedi per continuare.");
  return session.user;
}
