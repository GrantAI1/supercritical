import { PrismaClient } from "@prisma/client";

const GLOBAL_FOR_PRISMA = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = GLOBAL_FOR_PRISMA.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  GLOBAL_FOR_PRISMA.prisma = prisma;
}

export * from "@prisma/client";
