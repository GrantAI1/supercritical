import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Prisma, PrismaClient } from "@prisma/client";
import ws from "ws";

// Neon serverless driver: Postgres over WebSocket (443). No Rust engine binary,
// no outbound 5432 needed — works in serverless bundles and restrictive networks.
// `ws` MUST stay unbundled (next.config serverComponentsExternalPackages):
// webpack-bundled ws breaks frame masking ("t.mask is not a function").
neonConfig.webSocketConstructor = ws;

export function isUniqueViolation(err: unknown): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
    );
}

const GLOBAL_FOR_PRISMA = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
    const adapter = new PrismaNeon({
        connectionString: process.env.DATABASE_URL ?? "",
    });
    return new PrismaClient({ adapter });
}

export const prisma = GLOBAL_FOR_PRISMA.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
    GLOBAL_FOR_PRISMA.prisma = prisma;
}

export * from "@prisma/client";
