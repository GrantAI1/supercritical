import type { NormalizedEvent } from "@supercritical/core";

type GithubRepo = {
    full_name?: string;
    default_branch?: string;
};

type GithubPayload = {
    repository?: GithubRepo & { owner?: { login?: string } };
    ref?: string;
    head_commit?: { message?: string; timestamp?: string } | null;
    pusher?: { name?: string };
    action?: string;
    pull_request?: {
        number?: number;
        title?: string;
        merged?: boolean;
        user?: { login?: string };
    };
    workflow_run?: { name?: string; conclusion?: string; head_branch?: string };
    release?: { tag_name?: string; name?: string; author?: { login?: string } };
    sender?: { login?: string };
};

export function resolveGithubAccount(payload: unknown): string | null {
    const p = payload as GithubPayload;
    return p.repository?.owner?.login ?? null;
}

export function normalizeGithub(
    event_name: string,
    delivery_id: string,
    payload: unknown
): NormalizedEvent | null {
    const p = payload as GithubPayload;
    const repo = p.repository?.full_name;
    if (!repo) return null;

    const base = {
        source: "github" as const,
        service_external_id: repo,
        service_kind: "github.repo",
        service_name: repo,
        dedup_key: `github:${delivery_id}`,
        payload,
        occurred_at: new Date(),
    };

    switch (event_name) {
        case "push": {
            const branch = p.ref?.replace("refs/heads/", "") ?? "";
            const is_default =
                branch === (p.repository?.default_branch ?? "main");
            const occurred_at = p.head_commit?.timestamp
                ? new Date(p.head_commit.timestamp)
                : base.occurred_at;
            return {
                ...base,
                occurred_at,
                kind: "github.push",
                severity: "INFO",
                title: `push to ${branch} — ${p.head_commit?.message?.split("\n")[0] ?? "no commit message"}`,
                actor: p.pusher?.name ?? null,
                is_change_point: is_default,
                normalized: { branch, is_default_branch: is_default },
            };
        }
        case "pull_request": {
            const pr = p.pull_request;
            if (!pr) return null;
            if (p.action === "opened") {
                return {
                    ...base,
                    kind: "github.pull_request.opened",
                    severity: "INFO",
                    title: `PR #${pr.number} opened: ${pr.title ?? ""}`,
                    actor: pr.user?.login ?? null,
                    is_change_point: false,
                    normalized: { number: pr.number ?? null },
                };
            }
            if (p.action === "closed" && pr.merged) {
                return {
                    ...base,
                    kind: "github.pull_request.merged",
                    severity: "INFO",
                    title: `PR #${pr.number} merged: ${pr.title ?? ""}`,
                    actor: pr.user?.login ?? null,
                    is_change_point: true,
                    normalized: { number: pr.number ?? null },
                };
            }
            return null;
        }
        case "workflow_run": {
            const run = p.workflow_run;
            if (p.action !== "completed" || !run) return null;
            const failed = run.conclusion === "failure";
            return {
                ...base,
                kind: "github.workflow_run.completed",
                severity: failed ? "ERROR" : "INFO",
                title: `workflow ${run.name ?? ""} ${run.conclusion ?? ""} on ${run.head_branch ?? ""}`,
                actor: p.sender?.login ?? null,
                is_change_point: false,
                normalized: {
                    conclusion: run.conclusion ?? null,
                    workflow: run.name ?? null,
                },
            };
        }
        case "release": {
            const rel = p.release;
            if (p.action !== "published" || !rel) return null;
            return {
                ...base,
                kind: "github.release.published",
                severity: "INFO",
                title: `release ${rel.tag_name ?? ""} published`,
                actor: rel.author?.login ?? null,
                is_change_point: true,
                normalized: { tag: rel.tag_name ?? null },
            };
        }
        default:
            return null;
    }
}
