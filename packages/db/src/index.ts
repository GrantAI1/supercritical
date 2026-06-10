import { Prisma, PrismaClient } from "@prisma/client";

export function isUniqueViolation(err: unknown): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
    );
}

const GLOBAL_FOR_PRISMA = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = GLOBAL_FOR_PRISMA.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    GLOBAL_FOR_PRISMA.prisma = prisma;
}

export * from "@prisma/client";
