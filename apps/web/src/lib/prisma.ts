import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString });

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function hasExpectedDelegates(client: PrismaClient | undefined) {
  return Boolean(
    client &&
      "archiveStructureOverride" in client &&
      "dashboardFilterDefinition" in client &&
      "dashboardFilterOption" in client &&
      "dashboardMetricFilterOption" in client,
  );
}

const existingPrisma = globalForPrisma.prisma;

export const prisma: PrismaClient =
  existingPrisma && hasExpectedDelegates(existingPrisma)
    ? existingPrisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
