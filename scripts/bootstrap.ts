import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "../src/lib/db";

export async function bootstrapUser(): Promise<string> {
  const existing = await prisma.user.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  const credentials = z
    .object({
      email: z.email(),
      password: z.string().min(12).max(128),
      name: z.string().trim().min(1).max(100),
    })
    .safeParse({
      email: process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase(),
      password: process.env.INITIAL_ADMIN_PASSWORD,
      name: process.env.INITIAL_ADMIN_NAME ?? "Spazio personale",
    });
  if (!credentials.success)
    throw new Error(
      "Set INITIAL_ADMIN_EMAIL and a 12–128 character INITIAL_ADMIN_PASSWORD before the first startup.",
    );
  const password = await hashPassword(credentials.data.password);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83142197)`;
    const createdMeanwhile = await tx.user.findFirst({ select: { id: true } });
    if (createdMeanwhile) return createdMeanwhile.id;
    const id = randomUUID();
    await tx.user.create({
      data: {
        id,
        email: credentials.data.email,
        name: credentials.data.name,
        emailVerified: true,
      },
    });
    await tx.account.create({
      data: {
        id: randomUUID(),
        userId: id,
        accountId: id,
        providerId: "credential",
        password,
      },
    });
    console.info(
      "Account iniziale di Synapse creato. La registrazione pubblica è disabilitata.",
    );
    return id;
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  bootstrapUser()
    .then(() => console.info("Account di Synapse inizializzato."))
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Account bootstrap failed.",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
