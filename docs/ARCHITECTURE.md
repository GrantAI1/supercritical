# Supercritical — Architecture v0.1 (2026-06-09)

Cross-service correlation engine for dev infra. Vercel + Neon + Clerk + GitHub emit signals; nothing connects them. Supercritical normalizes all four into one event/metric stream, detects per-stream anomalies, correlates anomalies across services in time, assembles incidents, and calls Claude (`claude-fable-5`) as the last mile to explain. The pipeline is the product; AI is garnish.

---

## 1. Key decisions

| #   | Decision               | Choice                                                                                                                           | Rationale                                                                                                                        |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Ingest/compute split   | Webhooks are write-only fast path (verify → raw insert → normalize → 200). Correlation runs on a 1-min cron sweep, never inline. | Vercel = serverless, no daemons. 60s detection latency acceptable. Webhook handlers must return fast or providers retry/disable. |
| D2  | Queue                  | None in v1. Postgres (`webhook_deliveries`) is the durable buffer.                                                               | Fewer moving parts. Vercel Queues is beta — adopt later if sweep falls behind.                                                   |
| D3  | Time-series store      | Postgres (`metric_points`), 1-min resolution, monthly partitions, retention: raw 14d / 5-min rollups 90d.                        | One database. Ceiling ~10⁷–10⁸ rows; flagged as R6.                                                                              |
| D4  | Correlation unit       | Anomalies, not raw events. Detect per-stream anomalies first, then correlate anomalies.                                          | Raw event × event correlation is O(N²) and noisy. Anomaly count is small.                                                        |
| D5  | Correlation method     | Hybrid: seeded declarative rules (priors) + learned co-occurrence statistics (lift).                                             | Rules work day one (cold start). Stats improve precision over time. Pure ML = no day-one demo; pure rules = plateau.             |
| D6  | GitHub auth            | GitHub App (installation tokens), not OAuth app.                                                                                 | Fine-grained repo perms, webhooks bundled with installation, short-lived tokens (no refresh storage), org-level install.         |
| D7  | Vercel auth            | Vercel Integration (OAuth2 install flow).                                                                                        | One install yields API token + webhook subscription + team scoping.                                                              |
| D8  | AI placement           | Claude strictly post-pipeline. Never gates ingest, detection, or correlation.                                                    | Deterministic core. AI outage ⇒ degraded (raw evidence shown), never broken. Also cost control.                                  |
| D9  | Embeddings             | Voyage AI `voyage-3-large` (1024-d), pgvector HNSW cosine.                                                                       | **Anthropic has no embeddings API.** Second vendor unavoidable — flagged R4.                                                     |
| D10 | Realtime UI            | SWR polling @5s in v1; SSE endpoint stubbed for v2.                                                                              | Ship fast; Bloomberg feel survives 5s ticks.                                                                                     |
| D11 | Charts                 | uPlot (canvas).                                                                                                                  | Dense, 60fps with thousands of points. SVG chart libs die at terminal density.                                                   |
| D12 | API shape              | RSC reads hit `@supercritical/db` directly. Route handlers only for webhooks, OAuth, cron, mutations, streams. No tRPC.          | Thin surface, fewer layers.                                                                                                      |
| D13 | Tenancy                | `orgId` on every row, enforced via Prisma client extension (auto-filter). Postgres RLS deferred to v2.                           | RLS + Prisma + pooled Neon connections = friction; app-level first, flagged R11.                                                 |
| D14 | Secrets at rest        | Provider tokens AES-256-GCM encrypted with `MASTER_KEY` env var.                                                                 | Minimum viable. Rotation story unspecified — flagged R9.                                                                         |
| D15 | Idempotency everywhere | `@@unique(provider, deliveryId)`, event `dedupKey`, anomaly `dedupKey`, upserts in sweep.                                        | Webhooks redeliver, crons overlap, clocks skew. Replays must be no-ops.                                                          |
| D16 | Config                 | `vercel.ts` (`@vercel/config`) for crons/headers, not vercel.json.                                                               | Current recommended config surface; typed.                                                                                       |

---

## 2. Monorepo tree (Turborepo + pnpm)

```
supercritical/
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── vercel.ts                        # typed config: crons, headers
├── .env.example
├── docs/
│   ├── ARCHITECTURE.md              # this file
│   └── adr/                         # one file per decision D1..D16 as they evolve
├── apps/
│   └── web/                         # Next.js 14 App Router — UI + all HTTP surface
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       ├── middleware.ts            # Clerk auth; public: /, /api/webhooks/*, /api/cron/*
│       ├── app/
│       │   ├── (marketing)/
│       │   │   └── page.tsx
│       │   ├── (dashboard)/dashboard/      # /dashboard — "/" stays with marketing
│       │   │   ├── layout.tsx       # terminal shell: command bar, status strip, event ticker
│       │   │   ├── page.tsx         # overview: status grid + live tape + open incidents + sparklines
│       │   │   ├── incidents/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx    # swimlane timeline + correlation graph + AI panel
│       │   │   ├── events/page.tsx      # filterable event tape
│       │   │   ├── metrics/page.tsx     # metric explorer
│       │   │   ├── services/[id]/page.tsx
│       │   │   ├── topology/page.tsx    # app-group mapping UI (manual + suggested links)
│       │   │   └── settings/
│       │   │       └── connections/page.tsx
│       │   └── api/
│       │       ├── webhooks/
│       │       │   ├── vercel/route.ts
│       │       │   ├── github/route.ts
│       │       │   └── clerk/route.ts       # svix verification
│       │       ├── oauth/
│       │       │   ├── vercel/authorize/route.ts
│       │       │   ├── vercel/callback/route.ts
│       │       │   ├── github/install/route.ts
│       │       │   └── github/callback/route.ts
│       │       ├── cron/                    # all guarded by CRON_SECRET
│       │       │   ├── poll-neon/route.ts       # * * * * *
│       │       │   ├── poll-vercel/route.ts     # * * * * *  (runtime metrics — see R1)
│       │       │   ├── poll-clerk/route.ts      # */5 * * * *
│       │       │   ├── correlate/route.ts       # * * * * *  (anomaly detect + correlate + assemble)
│       │       │   ├── embed/route.ts           # */5 * * * * (incident embeddings)
│       │       │   └── prune/route.ts           # daily (retention/rollups)
│       │       ├── incidents/[id]/route.ts          # PATCH status/ack
│       │       ├── incidents/[id]/feedback/route.ts # POST verdict
│       │       ├── incidents/[id]/explain/route.ts  # POST → SSE-streamed Claude chat
│       │       ├── events/route.ts                  # GET cursor-paginated (tape polling)
│       │       ├── metrics/series/route.ts          # GET series for charts
│       │       ├── topology/route.ts                # POST/DELETE service links
│       │       └── connections/[id]/route.ts        # DELETE revoke
│       ├── components/
│       │   ├── terminal/            # CommandBar, EventTape, StatusGrid, TickerRow
│       │   ├── charts/              # Sparkline, SeriesChart (uPlot wrappers)
│       │   └── incidents/           # IncidentTimeline, CorrelationGraph, AiPanel
│       └── lib/                     # auth helpers, swr fetchers, formatters
├── packages/
│   ├── db/                          # @supercritical/db
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/sql/              # raw migrations: partitions, HNSW index, rollup fn
│   │   ├── src/client.ts            # extended client (org scoping)
│   │   └── src/vector.ts            # pgvector query helpers ($queryRaw)
│   ├── core/                        # @supercritical/core — zod NormalizedEvent, taxonomy
│   │   └── src/{events.ts, metrics.ts, taxonomy.ts, types.ts}
│   ├── ingest/                      # @supercritical/ingest — verify + normalize per provider
│   │   └── src/{vercel.ts, github.ts, clerk.ts, index.ts}
│   ├── connectors/                  # @supercritical/connectors — API clients + pollers
│   │   └── src/{vercel.ts, neon.ts, clerk.ts, github.ts}
│   ├── correlation/                 # @supercritical/correlation — pure functions, heavy tests
│   │   └── src/{anomaly/, scoring/, rules/, assemble/, sweep.ts}
│   ├── ai/                          # @supercritical/ai
│   │   └── src/{claude.ts, embeddings.ts, context-pack.ts, prompts/}   # prompts versioned
│   ├── crypto/                      # @supercritical/crypto — AES-256-GCM token sealing
│   └── config/                      # shared tsconfig / eslint / tailwind preset
└── tooling/
    ├── fixtures/                    # recorded webhook payloads per provider — replay tests + demo seed
    └── scripts/{seed-rules.ts, replay.ts}
```

`correlation/` and `core/` are pure (no I/O) — the engine is unit-testable against fixtures without any provider account.

---

## 3. Prisma schema

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")          // Neon pooled
  directUrl  = env("DIRECT_DATABASE_URL")   // Neon direct — migrations
  extensions = [vector]
}

// ─── enums ──────────────────────────────────────────────

enum Provider {
  VERCEL
  NEON
  CLERK
  GITHUB
}

enum ConnectionStatus {
  PENDING
  ACTIVE
  ERROR
  REVOKED
}

enum Severity {
  DEBUG
  INFO
  WARN
  ERROR
  CRITICAL
}

enum AnomalyKind {
  METRIC_SPIKE
  METRIC_DROP
  RATE_ANOMALY   // event-frequency anomaly (e.g. error-event burst)
  CHANGE_POINT   // deploy / merge / config change — pivot, not anomaly
}

enum IncidentStatus {
  OPEN
  ACKNOWLEDGED
  RESOLVED
  IGNORED
}

enum LinkSource {
  MANUAL
  INFERRED
}

enum FeedbackVerdict {
  CONFIRMED
  REJECTED
}

// ─── tenancy ────────────────────────────────────────────

model Organization {
  id                 String   @id @default(cuid())
  clerkOrgId         String   @unique
  name               String
  plan               String   @default("free")
  aiDailyTokenBudget Int      @default(200000)
  createdAt          DateTime @default(now())

  users        User[]
  connections  Connection[]
  services     Service[]
  appGroups    AppGroup[]
  events       Event[]
  anomalies    Anomaly[]
  correlations Correlation[]
  incidents    Incident[]
  rules        CorrelationRule[]
  pairStats    PairStat[]

  @@map("organizations")
}

model User {
  id          String   @id @default(cuid())
  clerkUserId String   @unique
  orgId       String
  email       String
  role        String   @default("member")
  createdAt   DateTime @default(now())

  org      Organization       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  feedback IncidentFeedback[]

  @@index([orgId])
  @@map("users")
}

// ─── connections & topology ─────────────────────────────

model Connection {
  id                String           @id @default(cuid())
  orgId             String
  provider          Provider
  status            ConnectionStatus @default(PENDING)
  externalAccountId String           // vercel team / github installation / neon org / clerk instance
  accessTokenEnc    Bytes?           // AES-256-GCM sealed
  refreshTokenEnc   Bytes?
  tokenExpiresAt    DateTime?
  webhookSecretEnc  Bytes?
  scopes            String[]
  metadata          Json             @default("{}")
  lastSyncAt        DateTime?
  createdAt         DateTime         @default(now())

  org         Organization      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  services    Service[]
  pollCursors PollCursor[]
  deliveries  WebhookDelivery[]

  @@unique([orgId, provider, externalAccountId])
  @@map("connections")
}

// A monitored resource: vercel project, neon database, github repo, clerk instance.
model Service {
  id           String   @id @default(cuid())
  orgId        String
  connectionId String
  provider     Provider
  kind         String   // "vercel.project" | "neon.database" | "github.repo" | "clerk.instance"
  externalId   String
  name         String
  metadata     Json     @default("{}")
  createdAt    DateTime @default(now())

  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  connection   Connection    @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  links        ServiceLink[]
  events       Event[]
  metricPoints MetricPoint[]
  anomalies    Anomaly[]

  @@unique([connectionId, externalId])
  @@index([orgId, provider])
  @@map("services")
}

// Logical application spanning providers — the correlation boundary.
model AppGroup {
  id        String   @id @default(cuid())
  orgId     String
  name      String
  createdAt DateTime @default(now())

  org   Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  links ServiceLink[]

  @@unique([orgId, name])
  @@map("app_groups")
}

model ServiceLink {
  id         String     @id @default(cuid())
  appGroupId String
  serviceId  String
  source     LinkSource @default(MANUAL)
  confidence Float      @default(1.0)   // INFERRED links < 1.0 until user confirms

  appGroup AppGroup @relation(fields: [appGroupId], references: [id], onDelete: Cascade)
  service  Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@unique([appGroupId, serviceId])
  @@map("service_links")
}

// ─── ingestion ──────────────────────────────────────────

// Raw inbox. Idempotency + audit + replay. Normalization may lag ingestion.
model WebhookDelivery {
  id             String    @id @default(cuid())
  provider       Provider
  deliveryId     String    // provider's delivery id — idempotency key
  connectionId   String?
  signatureValid Boolean
  payload        Json
  receivedAt     DateTime  @default(now())
  processedAt    DateTime?
  error          String?

  connection Connection? @relation(fields: [connectionId], references: [id], onDelete: SetNull)

  @@unique([provider, deliveryId])
  @@index([processedAt])
  @@map("webhook_deliveries")
}

// Normalized event — single taxonomy across all four providers.
model Event {
  id            String   @id @default(cuid())
  orgId         String
  serviceId     String
  provider      Provider
  kind          String   // "vercel.deployment.succeeded", "github.pull_request.merged", ...
  severity      Severity @default(INFO)
  title         String
  actor         String?
  isChangePoint Boolean  @default(false)  // deploys, merges, config changes
  dedupKey      String   // provider deliveryId or content hash
  occurredAt    DateTime // provider clock — correlation uses THIS
  receivedAt    DateTime @default(now())
  payload       Json     // raw provider payload
  normalized    Json     @default("{}")   // per-kind extracted fields

  org     Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  service Service      @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@unique([orgId, dedupKey])
  @@index([orgId, occurredAt(sort: Desc)])
  @@index([serviceId, kind, occurredAt(sort: Desc)])
  @@map("events")
}

// 1-min buckets. Partitioned by RANGE (ts) — monthly partitions + retention via
// hand-edited migration SQL (Prisma cannot express partitioning). Composite PK:
// Postgres requires the partition key inside every PK/unique on a partitioned table.
model MetricPoint {
  orgId     String
  serviceId String
  metric    String   // "neon.connections.active", "vercel.request.count", ...
  ts        DateTime // bucket start
  value     Float
  labels    Json?

  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@id([serviceId, metric, ts])
  @@index([orgId, ts])
  @@map("metric_points")
}

model PollCursor {
  id                  String    @id @default(cuid())
  connectionId        String
  key                 String    // "neon.metrics" | "clerk.aggregate" | "vercel.runtime" | "correlate.watermark"
  cursor              Json      @default("{}")
  lastRunAt           DateTime?
  lastSuccessAt       DateTime?
  consecutiveFailures Int       @default(0)

  connection Connection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, key])
  @@map("poll_cursors")
}

// ─── correlation engine ─────────────────────────────────

model Anomaly {
  id          String      @id @default(cuid())
  orgId       String
  serviceId   String
  kind        AnomalyKind
  metric      String?     // for METRIC_*
  eventKind   String?     // for RATE_ANOMALY / CHANGE_POINT
  windowStart DateTime
  windowEnd   DateTime
  score       Float       // robust z-score or -log10(p)
  baseline    Json        // stats snapshot — explainability + AI context
  eventId     String?     // CHANGE_POINT source event
  dedupKey    String      // hash(serviceId, signalKey, windowStart) — sweep idempotency
  createdAt   DateTime    @default(now())

  org     Organization        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  service Service             @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  members CorrelationMember[]

  @@unique([orgId, dedupKey])
  @@index([orgId, windowStart(sort: Desc)])
  @@map("anomalies")
}

// Declarative priors. orgId null ⇒ global seed rule.
model CorrelationRule {
  id              String  @id @default(cuid())
  orgId           String?
  name            String
  causeSelector   String  // "vercel.deployment.succeeded" | "metric:vercel.function.coldstarts:spike"
  effectSelector  String  // "metric:neon.connections.active:spike" | "event:*.error:rate"
  minLagSec       Int     @default(0)
  maxLagSec       Int     @default(600)
  tauSec          Int     @default(120)  // lag decay constant
  prior           Float   @default(0.5)
  requiresSameApp Boolean @default(true)
  enabled         Boolean @default(true)
  alpha           Float   @default(1)    // Beta posterior, updated by feedback
  beta            Float   @default(1)

  org          Organization? @relation(fields: [orgId], references: [id], onDelete: Cascade)
  correlations Correlation[]

  @@index([orgId, enabled])
  @@map("correlation_rules")
}

// Learned co-occurrence — lift numerators/denominators per signal pair.
model PairStat {
  id          String   @id @default(cuid())
  orgId       String
  causeKey    String   // normalized signal key
  effectKey   String
  coCount     Int      @default(0)  // co-occurrences within MAX_LAG
  causeCount  Int      @default(0)
  effectCount Int      @default(0)
  windowDays  Int      @default(30) // rolling horizon
  updatedAt   DateTime @updatedAt

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, causeKey, effectKey])
  @@map("pair_stats")
}

model Correlation {
  id         String   @id @default(cuid())
  orgId      String
  incidentId String?
  ruleId     String?
  score      Float    // 0..1 combined
  lagSeconds Int
  lift       Float?
  evidence   Json     // term breakdown: {prior, lift, lagKernel, topo, weights} — UI + AI show this
  createdAt  DateTime @default(now())

  org      Organization        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  incident Incident?           @relation(fields: [incidentId], references: [id], onDelete: SetNull)
  rule     CorrelationRule?    @relation(fields: [ruleId], references: [id], onDelete: SetNull)
  members  CorrelationMember[]

  @@index([orgId, createdAt(sort: Desc)])
  @@index([incidentId])
  @@map("correlations")
}

model CorrelationMember {
  correlationId String
  anomalyId     String
  role          String // "cause" | "effect"

  correlation Correlation @relation(fields: [correlationId], references: [id], onDelete: Cascade)
  anomaly     Anomaly     @relation(fields: [anomalyId], references: [id], onDelete: Cascade)

  @@id([correlationId, anomalyId])
  @@map("correlation_members")
}

// ─── incidents & AI ─────────────────────────────────────

model Incident {
  id          String                       @id @default(cuid())
  orgId       String
  status      IncidentStatus               @default(OPEN)
  severity    Severity                     @default(WARN)
  title       String
  summary     String?                      // Claude tl;dr — null until analysis lands
  windowStart DateTime
  windowEnd   DateTime
  serviceIds  String[]                     // denormalized — fast Jaccard dedup
  embedding   Unsupported("vector(1024)")? // voyage-3-large; HNSW index in raw SQL migration
  createdAt   DateTime                     @default(now())
  updatedAt   DateTime                     @updatedAt

  org          Organization       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  correlations Correlation[]
  analyses     AiAnalysis[]
  feedback     IncidentFeedback[]

  @@index([orgId, status, windowStart(sort: Desc)])
  @@map("incidents")
}

model AiAnalysis {
  id            String   @id @default(cuid())
  incidentId    String
  model         String   // "claude-fable-5"
  promptVersion String   // "explain-incident@v1"
  inputHash     String   // context-pack hash — cache key, no duplicate spend
  content       String   // prose explanation
  structured    Json     // {tldr, rootCauseHypotheses[{statement,confidence,evidence}], suggestedActions, blastRadius}
  inputTokens   Int
  outputTokens  Int
  costUsd       Decimal  @db.Decimal(10, 6)
  createdAt     DateTime @default(now())

  incident Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)

  @@unique([incidentId, inputHash])
  @@map("ai_analyses")
}

model IncidentFeedback {
  id         String          @id @default(cuid())
  incidentId String
  userId     String
  verdict    FeedbackVerdict
  note       String?
  createdAt  DateTime        @default(now())

  incident Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([incidentId, userId])
  @@map("incident_feedback")
}
```

Raw SQL migrations (Prisma can't express): `metric_points` monthly partitions; HNSW index `ON incidents USING hnsw (embedding vector_cosine_ops)`; 5-min rollup function; retention deletes.

---

## 4. Normalized event schema + taxonomy

Zod schema in `@supercritical/core` (single source of truth; every normalizer must emit it):

```
NormalizedEvent {
  source: "vercel" | "neon" | "clerk" | "github"
  kind: string                  // taxonomy below
  service_external_id: string
  service_kind: string          // "github.repo" | "vercel.project" — drives Service auto-upsert
  service_name: string
  occurred_at: ISO8601          // provider clock
  severity: DEBUG|INFO|WARN|ERROR|CRITICAL
  title: string
  actor?: string
  is_change_point: boolean
  dedup_key: string
  payload: unknown              // raw, preserved
  normalized: Record<string, JsonValue>   // per-kind extraction
}
```

Taxonomy = `source.entity.action`:

| Provider                       | Kinds (v1)                                                                                                 | Change-points                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| vercel                         | `deployment.created/succeeded/failed/canceled`, `project.created`, `domain.*`                              | `deployment.succeeded`                                              |
| github                         | `push`, `pull_request.opened/merged`, `workflow_run.completed`, `release.published`, `deployment_status.*` | `push` (default branch), `pull_request.merged`, `release.published` |
| clerk                          | `user.created/deleted`, `session.created/ended`, `organization.*`, `email.created`                         | —                                                                   |
| neon (synthetic, from polling) | `branch.created/deleted`, `compute.started/suspended`, `operation.failed`                                  | `branch.created`                                                    |

Metric names: `vercel.function.invocations`, `vercel.function.errors`, `vercel.function.coldstarts`, `vercel.function.p99ms`, `neon.connections.active`, `neon.compute.cu`, `neon.storage.bytes`, `clerk.signins.rate`, `clerk.signups.rate` (Clerk metrics derived from our own event aggregation — see R5).

---

## 5. Webhook ingestion pipeline

```
POST /api/webhooks/{provider}
  1. verify signature        (github: HMAC-SHA256 X-Hub-Signature-256; vercel: x-vercel-signature;
                              clerk: svix lib)  — fail ⇒ 401, store nothing
  2. resolve Connection      (by external account id in payload)
  3. INSERT WebhookDelivery  (unique [provider, deliveryId] ⇒ duplicate = 200 no-op)
  4. normalize → Event       (taxonomy mapping in @supercritical/ingest; unknown kind ⇒
                              delivery stays processedAt=null + error, alert ourselves — never drop silently)
  5. return 200              (< 500ms target; NO correlation inline — D1)
```

Step 4 runs inline in v1 (normalization is cheap). If a normalizer throws, the raw delivery survives — `replay.ts` reprocesses after the fix. That's why raw inbox and normalized events are separate tables.

---

## 6. OAuth flows

> **P1 status:** shipped manual connection entry instead — user creates a Connection (provider + account id) at `/dashboard/settings/connections`, gets a generated secret to paste into the provider's webhook config. Resolution: GitHub `repository.owner.login` / Vercel `payload.team.id ?? payload.user.id` matched against `Connection.externalAccountId`. The OAuth/App install flows below remain the target end-state.

**Vercel** (Integration, OAuth2 install flow):

```
GET /api/oauth/vercel/authorize  → redirect to Vercel install URL, state=signed nonce (CSRF)
GET /api/oauth/vercel/callback   → exchange code → access token + team id
                                 → seal token (AES-256-GCM) → Connection ACTIVE
                                 → list projects → upsert Services
                                 → webhook subscription comes with integration install
```

**GitHub** (GitHub App — D6):

```
GET /api/oauth/github/install    → redirect to app installation page
GET /api/oauth/github/callback   → installation_id → Connection (no long-lived user token stored)
runtime: mint installation tokens on demand via app private key (GITHUB_APP_PRIVATE_KEY env)
webhooks: configured once at the App level, delivered for all installations
```

**Neon + Clerk**: no OAuth in v1. User pastes API key (Neon) / uses existing Clerk instance secret. Keys sealed same as tokens. Honest scoping: v1 is "bring your key."

---

## 7. Polling layer (Vercel Cron, defined in vercel.ts)

| Cron          | Cadence | Work                                                                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `poll-neon`   | 1 min   | Neon API: projects/branches/endpoints diff → synthetic events; consumption/metrics → MetricPoints. Cursor in PollCursor. |
| `poll-vercel` | 1 min   | Runtime stats (invocations, errors, cold starts, p99) — **data source unverified, see R1**                               |
| `poll-clerk`  | 5 min   | Aggregate our own stored clerk events → `clerk.signins.rate` etc. MetricPoints (R5)                                      |
| `correlate`   | 1 min   | Engine sweep (§8)                                                                                                        |
| `embed`       | 5 min   | New/updated incidents → Voyage embedding → pgvector upsert                                                               |
| `prune`       | daily   | Retention: raw metrics >14d → delete (5-min rollups kept 90d); processed deliveries >30d                                 |

All cron routes check `Authorization: Bearer ${CRON_SECRET}`. Each poller: per-connection iteration, exponential backoff on failures (`consecutiveFailures`), jitter, hard per-invocation time budget (Fluid Compute 300s default is plenty).

---

## 8. Correlation engine (the product)

Pure functions in `@supercritical/correlation`. Sweep = watermark-driven, idempotent, re-scans trailing 10 min overlap for late arrivals (correlation uses `occurredAt`, webhooks deliver late — R8).

**Stage A — per-stream anomaly detection**

- Metrics: robust z-score per (service, metric): `z = (x − median) / MAD` over trailing 60-min window; `|z| ≥ 4` sustained ≥ 2 consecutive buckets ⇒ `METRIC_SPIKE`/`METRIC_DROP`. Adjacent windows merge. Baseline snapshot stored on the Anomaly (explainability).
- Event rates: count per (service, kind-class, 1-min bucket); Poisson tail probability vs trailing baseline rate; surprise `s = −log₁₀(p) ≥ 3` ⇒ `RATE_ANOMALY`.
- Change-points: every deploy/merge/config event ⇒ `CHANGE_POINT` anomaly unconditionally (they're pivots, not outliers).

**Stage B — candidate pairing**

- For each new anomaly E (effect), look back over `[occurredAt − MAX_LAG, occurredAt]`, `MAX_LAG = 900s`, for anomalies C (cause candidate) in _other_ services.
- Topology prune: same AppGroup ⇒ keep; cross-group ⇒ keep only if either service unmapped (penalized in scoring).

**Stage C — scoring**

```
score(C→E) = clamp01( w₁·rulePrior + w₂·liftTerm + w₃·lagKernel + w₄·topoBonus + w₅·sevBonus )
  w = (0.40, 0.25, 0.20, 0.10, 0.05)
  rulePrior = matching CorrelationRule posterior mean α/(α+β); no rule ⇒ 0
  liftTerm  = log(lift)/log(20) clamped [0,1], lift = P(E|C within MAX_LAG)/P(E) from PairStat,
              Laplace-smoothed; support < 5 ⇒ 0 (rules carry cold start — D5)
  lagKernel = exp(−lag/τ), τ from rule else 120s
  topoBonus = 1 same AppGroup; 0.3 unmapped; 0 cross-group
  sevBonus  = scaled effect severity
Thresholds: θ_surface = 0.55 (persist Correlation), θ_notify = 0.75 (page-worthy)
```

Evidence JSON stores every term — UI and Claude both show _why_ a correlation scored what it did. Never claim causality; the engine emits "correlated, lag X, lift Y, rule Z" — causal narrative is Claude's job, labeled as hypothesis.

**Stage D — incident assembly**

- Graph: nodes = anomalies, edges = correlations ≥ θ_surface within rolling 30-min window; connected components ⇒ incident candidates.
- Merge into existing OPEN incident if service-set Jaccard ≥ 0.5 ∧ time gap < 15 min; else create. Title templated from highest-scoring correlation ("Neon connection spike 47s after deploy dpl_x").
- Severity = max member severity, escalated one step if component spans ≥ 3 services.

**Stage E — learning loop**

- Every sweep updates PairStat counts (co-occurrences + marginals, 30-day rolling).
- IncidentFeedback CONFIRMED ⇒ rule α += 1; REJECTED ⇒ β += 1 (Beta posterior shifts prior). Rejected pairs also damp PairStat.

**Seed rules (day one)**: deploy→error-rate spike; deploy→p99 spike; coldstart spike→neon connection spike; merge→deploy (trivial, builds chain context); neon compute suspend→error spike; clerk signin surge→function invocation surge.

---

## 9. pgvector layer

- `incidents.embedding vector(1024)`, HNSW, cosine. Input text: title + summary + sorted anomaly signal keys + service kinds + rule names.
- Embedding provider: **Voyage AI** `voyage-3-large` (Anthropic has no embeddings endpoint — R4). Called only in `embed` cron, never in request path.
- Uses: (1) "similar past incidents" panel + Claude context (past incident + its resolution feedback = the highest-value AI context); (2) v2 incident dedup assist. v1 assembly stays Jaccard-based (deterministic, debuggable).
- Prisma can't query vectors — `$queryRaw` helpers in `packages/db/src/vector.ts`.

---

## 10. API surface

Reads = RSC direct via `@supercritical/db` (D12). Route handlers only:

| Route                                 | Method      | Purpose                                     |
| ------------------------------------- | ----------- | ------------------------------------------- |
| `/api/webhooks/{vercel,github,clerk}` | POST        | ingest (public, signature-gated)            |
| `/api/oauth/...`                      | GET         | flows (§6)                                  |
| `/api/cron/...`                       | GET         | schedulers (CRON_SECRET)                    |
| `/api/incidents/[id]`                 | PATCH       | status / ack                                |
| `/api/incidents/[id]/feedback`        | POST        | verdict (feeds Stage E)                     |
| `/api/incidents/[id]/explain`         | POST        | SSE-streamed Claude interactive analysis    |
| `/api/events`                         | GET         | cursor-paginated tape (5s polling)          |
| `/api/metrics/series`                 | GET         | (serviceId, metric, range, step) for charts |
| `/api/topology`                       | POST/DELETE | manage ServiceLinks                         |
| `/api/connections/[id]`               | DELETE      | revoke + token wipe                         |

---

## 11. Dashboard (Bloomberg terminal aesthetic)

- **Shell**: near-black `#0a0a0a`, hairline grid `#1a1a1a`, amber `#ffb000` accent, green/red status, monospace everywhere (Berkeley Mono / IBM Plex Mono), `tabular-nums`, 11–12px type, 24px rows. Dense tables, zero card fluff.
- **Layout**: persistent top status strip (per-service health, open incident count, ingest lag); bottom live event ticker; cmdk command bar (`INC`, `EVT`, `MET`, `TOP`, `CON` jump codes).
- **Overview** (`/`): service status grid w/ sparklines + open incidents (score-sorted) + live tape.
- **Incident detail**: swimlane timeline (one lane per service, anomaly windows shaded, change-points as vertical rules, lag annotations between correlated pairs); correlation graph (small DAG, edge width = score, click ⇒ evidence term breakdown); AI panel (streamed `claude-fable-5` analysis, confidence-labeled hypotheses, confirm/reject buttons ⇒ feedback).
- Charts: uPlot canvas (D11). Realtime: SWR 5s (D10).
- Note: dashboard build phase will run ui-ux-pro-max → frontend-design skills per global convention; this section is architecture only.

---

## 12. AI layer (`@supercritical/ai`)

Claude is called exactly three ways — never in ingest/detection path (D8):

1. **`explainIncident(incident_id)`** — async after incident assembly (fire-and-forget from correlate cron). Builds ContextPack, calls `claude-fable-5` with forced structured output, stores AiAnalysis.
2. **`chatIncident(incident_id, messages)`** — user-invoked, SSE-streamed, tool-use enabled. Tools: `query_events`, `query_metric_series`, `get_deploy_diff` (GitHub compare for the change-point), `similar_incidents` (pgvector).
3. **`embedIncident(incident_id)`** — Voyage, not Claude (R4).

**ContextPack** (deterministic order ⇒ stable `inputHash` cache key; ~20k token budget):

1. incident header + anomalies with baseline stats
2. correlation evidence (rule, lift, lag, term breakdown)
3. change-point payloads in full (deploy meta, commit messages, PR titles)
4. topology (AppGroup membership)
5. top-5 similar past incidents + their feedback/resolution
6. per-stream event samples (first 5 + last 5, capped)

**Output schema**: `{tldr, rootCauseHypotheses: [{statement, confidence, evidence[]}], suggestedActions[], blastRadius}` — hypotheses explicitly labeled as hypotheses (engine reports correlation; Claude narrates plausible causation).

**Cost guards**: `inputHash` dedup (no duplicate spend on unchanged incidents); per-org daily token budget (`aiDailyTokenBudget`); re-run only on material incident change (new anomaly joins component); max_tokens cap; model id from env (`MODEL_ID=claude-fable-5`).

**Failure mode**: AI down ⇒ incident exists with raw evidence UI; summary fills in whenever.

---

## 13. Risks & underspecified (resolve before building)

| #   | Risk                                                                                                                                                                                                                                                                                                                                                                             | Severity                | Position                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Vercel cold-start/runtime metrics are NOT webhooked.** The headline demo (cold-start spike → pool exhaustion) depends on runtime data: Vercel Observability API / Drains are plan-gated and shapes unverified.                                                                                                                                                                 | **HIGH — verify first** | Spike this before any engine work. Fallbacks: log drains → ingest endpoint; or demo on deploy→error correlation instead.       |
| R2  | **Neon live connection counts**: public API gives projects/ops/consumption (coarse, lagging). Real-time pool stats options: (a) Neon metrics export (OTel) — needs a receiver, we're serverless; (b) direct `pg_stat_activity` polling on customer DB — requires their connection string (big trust ask, must be explicit opt-in + read-only role); (c) coarse consumption only. | **HIGH**                | v1: (c) + optional (b) behind explicit consent. Decide before schema freeze of metric names.                                   |
| R3  | **Entity resolution / topology**: no API says "this Neon DB serves this Vercel project." Heuristics (Vercel env vars contain Neon host — reading customer env vars is a sensitive scope) vs manual mapping.                                                                                                                                                                      | **HIGH**                | v1: manual topology UI + INFERRED suggestions (name similarity, integration metadata). Correlation quality is bounded by this. |
| R4  | **Anthropic has no embeddings API** — pgvector requires a second vendor (Voyage). Contradicts "Anthropic-only" framing.                                                                                                                                                                                                                                                          | MED                     | Accept Voyage; isolate behind `embeddings.ts` interface.                                                                       |
| R5  | **Clerk has no metrics API** — auth metrics must be derived by aggregating Clerk webhook events we store. No backfill before install; baselines need ~24h warm-up.                                                                                                                                                                                                               | MED                     | Accept; document warm-up.                                                                                                      |
| R6  | **MetricPoint volume in Postgres**: 1-min × metrics × services; fine to ~10⁷ rows, then partitions/retention mandatory, Timescale/ClickHouse eventually. Prisma can't manage partitions ⇒ raw SQL migrations from day one.                                                                                                                                                       | MED                     | D3 + prune cron. Revisit at 100 orgs.                                                                                          |
| R7  | **Vercel cron granularity is plan-gated** (Hobby = daily). 1-min sweeps need Pro.                                                                                                                                                                                                                                                                                                | LOW-MED                 | Budget for Pro.                                                                                                                |
| R8  | **Clock skew + late webhook delivery**: correlation on `occurredAt`, providers retry for minutes. Sweep must re-scan trailing overlap; all writes idempotent.                                                                                                                                                                                                                    | MED                     | Designed in (§8); test with replay fixtures.                                                                                   |
| R9  | **Token encryption key management**: single `MASTER_KEY` env var, no rotation story.                                                                                                                                                                                                                                                                                             | MED                     | Acceptable v1; write ADR for envelope encryption later.                                                                        |
| R10 | **False-positive economics**: product credibility dies on noisy correlations. No ground truth at launch.                                                                                                                                                                                                                                                                         | **HIGH (product)**      | Conservative θ, feedback loop (Stage E), and a "shadow mode" first 2 weeks per org: detect + log, don't notify.                |
| R11 | **Tenancy enforcement is app-level only** (Prisma extension). One missed filter = cross-org leak.                                                                                                                                                                                                                                                                                | MED                     | Extension + tests that assert orgId on every query; RLS in v2.                                                                 |
| R12 | Underspecified product surface: alert delivery channels (in-app only? Slack/email?), retention/billing tiers, detection-latency SLO, onboarding (self-serve vs design partners). Spec pinned Next.js 14 — Next 15/16 current; confirm before scaffold.                                                                                                                           | MED                     | Decide pre-build; none block schema.                                                                                           |

---

## 14. Build order

1. **P0** — scaffold: turborepo, `db` + schema + raw SQL migrations, Clerk auth shell, org bootstrap webhook.
2. **P1** — ingest: GitHub App + Vercel integration webhooks → normalized events → live event tape. _Visible value: unified tape._
3. **P2** — polling: Neon + Vercel + Clerk-aggregate metrics → sparklines. **Gate: R1/R2 spike results.**
4. **P3** — engine: rules-only sweep → anomalies → correlations → incidents. Tested against replay fixtures before any real traffic.
5. **P4** — AI: ContextPack + explain + chat + embeddings + similar-incidents.
6. **P5** — learning: PairStat lift, feedback posteriors, topology inference suggestions.

Replay fixtures (`tooling/fixtures`) double as demo seed — scripted "cold start → pool exhaustion" storyline for environments without live traffic.
