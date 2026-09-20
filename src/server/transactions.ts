import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

// Serialize one user's knowledge mutations so title resolution and parent-cycle checks
// remain correct even when two editor tabs save concurrently. Other users are independent.
export async function withUserTransaction<T>(userId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    return work(tx);
  }, { maxWait: 10_000, timeout: 30_000 });
}
