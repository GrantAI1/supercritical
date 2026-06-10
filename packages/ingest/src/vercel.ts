import type { NormalizedEvent } from "@supercritical/core";

type VercelEnvelope = {
  id?: string;
  type?: string;
  createdAt?: number;
  payload?: {
    team?: { id?: string } | null;
    user?: { id?: string } | null;
    project?: { id?: string };
    deployment?: { id?: string; name?: string; url?: string };
    target?: string | null;
  };
};

const KIND_MAP: Record<string, { severity: "INFO" | "ERROR" | "WARN"; verb: string }> = {
  "deployment.created": { severity: "INFO", verb: "created" },
  "deployment.succeeded": { severity: "INFO", verb: "succeeded" },
  "deployment.error": { severity: "ERROR", verb: "failed" },
  "deployment.canceled": { severity: "WARN", verb: "canceled" },
  "project.created": { severity: "INFO", verb: "created" },
  "project.removed": { severity: "WARN", verb: "removed" }
};

export function resolveVercelAccount(envelope: unknown): string | null {
  const e = envelope as VercelEnvelope;
  return e.payload?.team?.id ?? e.payload?.user?.id ?? null;
}

export function normalizeVercel(envelope: unknown): NormalizedEvent | null {
  const e = envelope as VercelEnvelope;
  if (!e.id || !e.type || !e.payload) return null;
  const mapping = KIND_MAP[e.type];
  if (!mapping) return null;

  const project_id = e.payload.project?.id ?? e.payload.deployment?.name;
  if (!project_id) return null;
  const name = e.payload.deployment?.name ?? project_id;
  const is_prod_deploy_success =
    e.type === "deployment.succeeded" && e.payload.target === "production";

  return {
    source: "vercel",
    kind: `vercel.${e.type}`,
    service_external_id: project_id,
    service_kind: "vercel.project",
    service_name: name,
    severity: mapping.severity,
    title: `${name} deployment ${mapping.verb}${e.payload.target ? ` (${e.payload.target})` : ""}`,
    actor: null,
    is_change_point: is_prod_deploy_success,
    dedup_key: `vercel:${e.id}`,
    occurred_at: e.createdAt ? new Date(e.createdAt) : new Date(),
    payload: envelope,
    normalized: {
      deployment_id: e.payload.deployment?.id ?? null,
      url: e.payload.deployment?.url ?? null,
      target: e.payload.target ?? null
    }
  };
}
