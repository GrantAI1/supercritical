import { describe, expect, it } from "vitest";
import { normalizeGithub, resolveGithubAccount } from "./github";

const REPO = {
  id: 99,
  full_name: "acme/api",
  name: "api",
  default_branch: "main",
  owner: { login: "acme", id: 1 }
};

describe("resolveGithubAccount", () => {
  it("returns repository owner login", () => {
    expect(resolveGithubAccount({ repository: REPO })).toBe("acme");
  });
  it("returns null when absent", () => {
    expect(resolveGithubAccount({})).toBeNull();
  });
});

describe("normalizeGithub", () => {
  it("push to default branch is a change point", () => {
    const evt = normalizeGithub("push", "d-1", {
      repository: REPO,
      ref: "refs/heads/main",
      head_commit: { message: "fix: thing", timestamp: "2026-06-10T12:00:00Z" },
      pusher: { name: "alice" }
    });
    expect(evt).toMatchObject({
      source: "github",
      kind: "github.push",
      service_external_id: "acme/api",
      service_kind: "github.repo",
      is_change_point: true,
      severity: "INFO",
      actor: "alice",
      dedup_key: "github:d-1"
    });
  });

  it("push to feature branch is NOT a change point", () => {
    const evt = normalizeGithub("push", "d-2", {
      repository: REPO,
      ref: "refs/heads/feature-x",
      pusher: { name: "alice" }
    });
    expect(evt?.is_change_point).toBe(false);
  });

  it("merged PR is pull_request.merged change point", () => {
    const evt = normalizeGithub("pull_request", "d-3", {
      repository: REPO,
      action: "closed",
      pull_request: { number: 7, title: "Add thing", merged: true, user: { login: "bob" } }
    });
    expect(evt).toMatchObject({ kind: "github.pull_request.merged", is_change_point: true });
  });

  it("closed-unmerged PR is ignored", () => {
    const evt = normalizeGithub("pull_request", "d-4", {
      repository: REPO,
      action: "closed",
      pull_request: { number: 7, title: "x", merged: false, user: { login: "bob" } }
    });
    expect(evt).toBeNull();
  });

  it("failed workflow_run is ERROR severity", () => {
    const evt = normalizeGithub("workflow_run", "d-5", {
      repository: REPO,
      action: "completed",
      workflow_run: { name: "CI", conclusion: "failure", head_branch: "main" }
    });
    expect(evt).toMatchObject({ kind: "github.workflow_run.completed", severity: "ERROR" });
  });

  it("unknown event returns null", () => {
    expect(normalizeGithub("watch", "d-6", { repository: REPO })).toBeNull();
  });
});
