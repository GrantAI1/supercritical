-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('VERCEL', 'NEON', 'CLERK', 'GITHUB');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnomalyKind" AS ENUM ('METRIC_SPIKE', 'METRIC_DROP', 'RATE_ANOMALY', 'CHANGE_POINT');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "LinkSource" AS ENUM ('MANUAL', 'INFERRED');

-- CreateEnum
CREATE TYPE "FeedbackVerdict" AS ENUM ('CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "aiDailyTokenBudget" INTEGER NOT NULL DEFAULT 200000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "externalAccountId" TEXT NOT NULL,
    "accessTokenEnc" BYTEA,
    "refreshTokenEnc" BYTEA,
    "tokenExpiresAt" TIMESTAMP(3),
    "webhookSecretEnc" BYTEA,
    "scopes" TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_groups" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_links" (
    "id" TEXT NOT NULL,
    "appGroupId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "source" "LinkSource" NOT NULL DEFAULT 'MANUAL',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "service_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "connectionId" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "actor" TEXT,
    "isChangePoint" BOOLEAN NOT NULL DEFAULT false,
    "dedupKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "normalized" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_points" (
    "orgId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "labels" JSONB,

    CONSTRAINT "metric_points_pkey" PRIMARY KEY ("serviceId","metric","ts")
) PARTITION BY RANGE ("ts");

CREATE TABLE "metric_points_default" PARTITION OF "metric_points" DEFAULT;

-- CreateTable
CREATE TABLE "poll_cursors" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "poll_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "kind" "AnomalyKind" NOT NULL,
    "metric" TEXT,
    "eventKind" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "baseline" JSONB NOT NULL,
    "eventId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlation_rules" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "causeSelector" TEXT NOT NULL,
    "effectSelector" TEXT NOT NULL,
    "minLagSec" INTEGER NOT NULL DEFAULT 0,
    "maxLagSec" INTEGER NOT NULL DEFAULT 600,
    "tauSec" INTEGER NOT NULL DEFAULT 120,
    "prior" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "requiresSameApp" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "beta" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "correlation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pair_stats" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "causeKey" TEXT NOT NULL,
    "effectKey" TEXT NOT NULL,
    "coCount" INTEGER NOT NULL DEFAULT 0,
    "causeCount" INTEGER NOT NULL DEFAULT 0,
    "effectCount" INTEGER NOT NULL DEFAULT 0,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pair_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "incidentId" TEXT,
    "ruleId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "lagSeconds" INTEGER NOT NULL,
    "lift" DOUBLE PRECISION,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correlations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlation_members" (
    "correlationId" TEXT NOT NULL,
    "anomalyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "correlation_members_pkey" PRIMARY KEY ("correlationId","anomalyId")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Severity" NOT NULL DEFAULT 'WARN',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "serviceIds" TEXT[],
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_feedback" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verdict" "FeedbackVerdict" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_clerkOrgId_key" ON "organizations"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "users"("clerkUserId");

-- CreateIndex
CREATE INDEX "users_orgId_idx" ON "users"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_orgId_provider_externalAccountId_key" ON "connections"("orgId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "services_orgId_provider_idx" ON "services"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "services_connectionId_externalId_key" ON "services"("connectionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "app_groups_orgId_name_key" ON "app_groups"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "service_links_appGroupId_serviceId_key" ON "service_links"("appGroupId", "serviceId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_processedAt_idx" ON "webhook_deliveries"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_provider_deliveryId_key" ON "webhook_deliveries"("provider", "deliveryId");

-- CreateIndex
CREATE INDEX "events_orgId_occurredAt_idx" ON "events"("orgId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "events_serviceId_kind_occurredAt_idx" ON "events"("serviceId", "kind", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "events_orgId_dedupKey_key" ON "events"("orgId", "dedupKey");

-- CreateIndex
CREATE INDEX "metric_points_orgId_ts_idx" ON "metric_points"("orgId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "poll_cursors_connectionId_key_key" ON "poll_cursors"("connectionId", "key");

-- CreateIndex
CREATE INDEX "anomalies_orgId_windowStart_idx" ON "anomalies"("orgId", "windowStart" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "anomalies_orgId_dedupKey_key" ON "anomalies"("orgId", "dedupKey");

-- CreateIndex
CREATE INDEX "correlation_rules_orgId_enabled_idx" ON "correlation_rules"("orgId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "pair_stats_orgId_causeKey_effectKey_key" ON "pair_stats"("orgId", "causeKey", "effectKey");

-- CreateIndex
CREATE INDEX "correlations_orgId_createdAt_idx" ON "correlations"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "correlations_incidentId_idx" ON "correlations"("incidentId");

-- CreateIndex
CREATE INDEX "incidents_orgId_status_windowStart_idx" ON "incidents"("orgId", "status", "windowStart" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_analyses_incidentId_inputHash_key" ON "ai_analyses"("incidentId", "inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "incident_feedback_incidentId_userId_key" ON "incident_feedback"("incidentId", "userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_groups" ADD CONSTRAINT "app_groups_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_links" ADD CONSTRAINT "service_links_appGroupId_fkey" FOREIGN KEY ("appGroupId") REFERENCES "app_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_links" ADD CONSTRAINT "service_links_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_points" ADD CONSTRAINT "metric_points_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_cursors" ADD CONSTRAINT "poll_cursors_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlation_rules" ADD CONSTRAINT "correlation_rules_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pair_stats" ADD CONSTRAINT "pair_stats_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "correlation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlation_members" ADD CONSTRAINT "correlation_members_correlationId_fkey" FOREIGN KEY ("correlationId") REFERENCES "correlations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlation_members" ADD CONSTRAINT "correlation_members_anomalyId_fkey" FOREIGN KEY ("anomalyId") REFERENCES "anomalies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_feedback" ADD CONSTRAINT "incident_feedback_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_feedback" ADD CONSTRAINT "incident_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Month partitions: current + N ahead. Re-run from the prune cron.
CREATE OR REPLACE FUNCTION ensure_metric_partitions(months_ahead INT DEFAULT 2)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  m DATE;
  part_name TEXT;
BEGIN
  FOR i IN 0..months_ahead LOOP
    m := (date_trunc('month', now()) + (i || ' months')::interval)::date;
    part_name := 'metric_points_' || to_char(m, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "metric_points" FOR VALUES FROM (%L) TO (%L)',
      part_name, m, (m + interval '1 month')::date
    );
  END LOOP;
END $$;

SELECT ensure_metric_partitions();

-- pgvector ANN index for similar-incident retrieval (cosine).
CREATE INDEX "incidents_embedding_hnsw_idx" ON "incidents"
  USING hnsw ("embedding" vector_cosine_ops);
