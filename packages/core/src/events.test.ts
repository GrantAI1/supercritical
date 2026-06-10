import { describe, expect, it } from "vitest";
import { NORMALIZED_EVENT_SCHEMA } from "./events";

const VALID_EVENT = {
  source: "github",
  kind: "github.push",
  service_external_id: "acme/api",
  service_kind: "github.repo",
  service_name: "acme/api",
  severity: "INFO",
  title: "push to main by alice",
  actor: "alice",
  is_change_point: true,
  dedup_key: "github:abc-123",
  occurred_at: "2026-06-10T12:00:00.000Z",
  payload: { ref: "refs/heads/main" },
  normalized: { branch: "main" }
};

describe("NORMALIZED_EVENT_SCHEMA", () => {
  it("parses a valid event and coerces occurred_at to Date", () => {
    const parsed = NORMALIZED_EVENT_SCHEMA.parse(VALID_EVENT);
    expect(parsed.occurred_at).toBeInstanceOf(Date);
    expect(parsed.kind).toBe("github.push");
  });

  it("rejects unknown source", () => {
    expect(() =>
      NORMALIZED_EVENT_SCHEMA.parse({ ...VALID_EVENT, source: "stripe" })
    ).toThrow();
  });

  it("rejects missing dedup_key", () => {
    const { dedup_key: _omitted, ...rest } = VALID_EVENT;
    expect(() => NORMALIZED_EVENT_SCHEMA.parse(rest)).toThrow();
  });
});
