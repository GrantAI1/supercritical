// Rebuilds the supercritical database + schema on a fresh Neon project over
// WebSocket (port 443) — works even when outbound 5432 is blocked.
// Usage: NEON_HOST=... NEON_PASSWORD=... node tooling/scripts/restore-db.mjs
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const HOST = process.env.NEON_HOST;
const PASSWORD = process.env.NEON_PASSWORD;
const USER = "neondb_owner";
if (!HOST || !PASSWORD) {
    console.error("NEON_HOST and NEON_PASSWORD env required");
    process.exit(1);
}

function makeClient(database) {
    return new Client({
        host: HOST,
        user: USER,
        password: PASSWORD,
        database,
        ssl: true,
    });
}

// 1. Ensure database exists
const admin = makeClient("neondb");
await admin.connect();
const db_exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = 'supercritical'"
);
if (db_exists.rowCount === 0) {
    await admin.query("CREATE DATABASE supercritical");
    console.log("DATABASE CREATED");
} else {
    console.log("DATABASE ALREADY EXISTS");
}
await admin.end();

// 2. Apply migration 0 (multi-statement simple query)
const migration_sql = readFileSync(
    new URL("../../packages/db/prisma/migrations/0_init/migration.sql", import.meta.url),
    "utf8"
);
const db = makeClient("supercritical");
await db.connect();
const already = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations'"
);
if (already.rowCount === 0) {
    await db.query(migration_sql);
    console.log("MIGRATION APPLIED");
} else {
    console.log("SCHEMA ALREADY PRESENT — skipping migration");
}

// 3. Prisma migrate bookkeeping so future `migrate deploy` sees 0_init as applied
await db.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
)`);
const checksum = createHash("sha256").update(migration_sql).digest("hex");
await db.query(
    `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count")
     SELECT $1,$2,now(),'0_init',1
     WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name"='0_init')`,
    [randomUUID(), checksum]
);

// 4. Verify
const tables = await db.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
);
const parts = await db.query(
    "SELECT inhrelid::regclass::text AS part FROM pg_inherits WHERE inhparent='metric_points'::regclass ORDER BY 1"
);
const idx = await db.query(
    "SELECT indexname FROM pg_indexes WHERE indexname='incidents_embedding_hnsw_idx'"
);
const ext = await db.query("SELECT extversion FROM pg_extension WHERE extname='vector'");
console.log("TABLES:", tables.rows[0].n);
console.log("PARTITIONS:", parts.rows.map((r) => r.part).join(", "));
console.log("HNSW:", idx.rowCount === 1 ? "OK" : "MISSING");
console.log("PGVECTOR:", ext.rows[0]?.extversion ?? "MISSING");
await db.end();
