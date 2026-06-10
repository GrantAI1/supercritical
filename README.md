# Supercritical

Cross-service correlation engine for dev infrastructure. Vercel + Neon + Clerk + GitHub emit signals; Supercritical normalizes them into one stream, correlates anomalies across services, and has Claude explain the incident. Bloomberg Terminal for your stack.

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Spike findings: [docs/spikes/](docs/spikes/)

## Prerequisites

- Node ≥ 20, pnpm 11 (`corepack enable`)

## Setup

```bash
pnpm install
cp .env.example .env          # fill in Neon + Clerk values
pnpm db:generate
```

Provision the database (Neon): set `DATABASE_URL` (pooled) + `DIRECT_DATABASE_URL` (direct) in `.env`, then:

```bash
pnpm --filter @supercritical/db migrate:deploy
```

See [packages/db/README.md](packages/db/README.md) — **never `prisma migrate dev`** (hand-edited partition DDL).

## Commands

```bash
pnpm build       # turbo build all
pnpm typecheck
pnpm test
pnpm --filter @supercritical/web dev
```

## Status

P0 (scaffold, schema, Clerk shell, org bootstrap) — done. Next: P1 ingest (GitHub + Vercel webhooks → live event tape), per ARCHITECTURE.md §14.
