import { describe, expect, it } from "vitest";
import { normalizeVercel, resolveVercelAccount } from "./vercel";

function envelope(type: string, payload: Record<string, unknown>) {
  return { id: "evt_1", type, createdAt: 1781136000000, payload };
}

const DEPLOY_PAYLOAD = {
  team: { id: "team_x" },
  user: { id: "user_x" },
  project: { id: "prj_x" },
  deployment: { id: "dpl_1", name: "my-app", url: "my-app-abc.vercel.app" },
  target: "production"
};

describe("resolveVercelAccount", () => {
  it("prefers team id", () => {
    expect(resolveVercelAccount(envelope("deployment.created", DEPLOY_PAYLOAD))).toBe("team_x");
  });
  it("falls back to user id", () => {
    expect(
      resolveVercelAccount(envelope("deployment.created", { ...DEPLOY_PAYLOAD, team: null }))
    ).toBe("user_x");
  });
});

describe("normalizeVercel", () => {
  it("production deployment.succeeded is a change point", () => {
    const evt = normalizeVercel(envelope("deployment.succeeded", DEPLOY_PAYLOAD));
    expect(evt).toMatchObject({
      source: "vercel",
      kind: "vercel.deployment.succeeded",
      service_external_id: "prj_x",
      service_kind: "vercel.project",
      service_name: "my-app",
      is_change_point: true,
      severity: "INFO",
      dedup_key: "vercel:evt_1"
    });
    expect(evt?.occurred_at.getTime()).toBe(1781136000000);
  });

  it("preview deployment.succeeded is NOT a change point", () => {
    const evt = normalizeVercel(
      envelope("deployment.succeeded", { ...DEPLOY_PAYLOAD, target: "preview" })
    );
    expect(evt?.is_change_point).toBe(false);
  });

  it("deployment.error is ERROR severity", () => {
    const evt = normalizeVercel(envelope("deployment.error", DEPLOY_PAYLOAD));
    expect(evt).toMatchObject({ kind: "vercel.deployment.error", severity: "ERROR" });
  });

  it("unknown type returns null", () => {
    expect(normalizeVercel(envelope("integration-configuration.removed", {}))).toBeNull();
  });

  it("malformed envelope returns null", () => {
    expect(normalizeVercel({ nope: true })).toBeNull();
  });
});
