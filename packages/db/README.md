# @supercritical/db

Prisma schema, migrations, and client for Supercritical.

## Migration workflow — READ THIS

**Never run `prisma migrate dev`.** Migration `0_init` contains hand-edited DDL Prisma cannot express (`metric_points` is partitioned by `RANGE (ts)`, plus an HNSW index on `incidents.embedding`). `migrate dev`'s drift detection will fight it.

Authoring a new migration:

1. `pnpm migrate:diff` — diffs applied migrations vs `schema.prisma`, prints SQL.
2. Save it under `prisma/migrations/<n>_<name>/migration.sql`; hand-edit if it touches partitioned tables or vector columns.
3. Apply with `pnpm migrate:deploy` (uses `DIRECT_DATABASE_URL` — the non-pooled Neon endpoint).

First-time setup against a fresh Neon database: set `DATABASE_URL` (pooled) + `DIRECT_DATABASE_URL` (direct) and run `pnpm migrate:deploy`.

## Partitions

`metric_points` partitions are monthly. Migration 0 creates a `DEFAULT` partition plus current+2 months via `ensure_metric_partitions(months_ahead)`. The prune cron (P2) must call `SELECT ensure_metric_partitions();` periodically and drop expired partitions per the retention policy (raw 14d / 5-min rollups 90d).

## pgvector

`incidents.embedding vector(1024)` is `Unsupported(...)` in Prisma — query it via `$queryRaw` helpers only (`src/vector.ts`, lands in P4).
