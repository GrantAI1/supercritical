// Prod E2E over WebSocket db access (no 5432 needed locally).
// Creates/reuses a GITHUB connection, fires signed webhook at prod, verifies Event row.
// Usage: NEON_HOST=... NEON_PASSWORD=... MASTER_KEY=... node tooling/scripts/prod-e2e.mjs <base_url>
import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    randomUUID,
} from "node:crypto";
import { Client, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const BASE_URL = process.argv[2];
const { NEON_HOST, NEON_PASSWORD, MASTER_KEY } = process.env;
if (!BASE_URL || !NEON_HOST || !NEON_PASSWORD || !MASTER_KEY) {
    console.error("usage: NEON_HOST, NEON_PASSWORD, MASTER_KEY env + base_url arg");
    process.exit(1);
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function seal(plaintext, key_b64) {
    const key = Buffer.from(key_b64, "base64");
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function unseal(sealed, key_b64) {
    const key = Buffer.from(key_b64, "base64");
    const iv = sealed.subarray(0, IV_LENGTH);
    const tag = sealed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ct = sealed.subarray(IV_LENGTH + TAG_LENGTH);
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

function cuid_ish() {
    return "c" + randomUUID().replace(/-/g, "").slice(0, 24);
}

const db = new Client({
    host: NEON_HOST,
    user: "neondb_owner",
    password: NEON_PASSWORD,
    database: "supercritical",
    ssl: true,
});
await db.connect();

// org
let org = await db.query(`SELECT id FROM organizations WHERE "clerkOrgId"='e2e_org'`);
if (org.rowCount === 0) {
    org = await db.query(
        `INSERT INTO organizations (id, "clerkOrgId", name) VALUES ($1,'e2e_org','E2E') RETURNING id`,
        [cuid_ish()]
    );
}
const org_id = org.rows[0].id;

// connection
let secret;
let conn = await db.query(
    `SELECT id, "webhookSecretEnc" FROM connections WHERE "orgId"=$1 AND provider='GITHUB' AND "externalAccountId"='e2e-owner'`,
    [org_id]
);
if (conn.rowCount > 0) {
    secret = unseal(Buffer.from(conn.rows[0].webhookSecretEnc), MASTER_KEY);
} else {
    secret = randomBytes(32).toString("hex");
    await db.query(
        `INSERT INTO connections (id, "orgId", provider, status, "externalAccountId", "webhookSecretEnc", scopes, metadata)
         VALUES ($1,$2,'GITHUB','ACTIVE','e2e-owner',$3,'{}','{}')`,
        [cuid_ish(), org_id, seal(secret, MASTER_KEY)]
    );
}

// fire signed webhook
const delivery_id = randomUUID();
const body = JSON.stringify({
    repository: {
        id: 1,
        full_name: "e2e-owner/demo",
        name: "demo",
        default_branch: "main",
        owner: { login: "e2e-owner", id: 1 },
    },
    ref: "refs/heads/main",
    head_commit: { message: "e2e: prod test", timestamp: new Date().toISOString() },
    pusher: { name: "e2e-bot" },
});
const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const headers = {
    "content-type": "application/json",
    "x-github-delivery": delivery_id,
    "x-github-event": "push",
    "x-hub-signature-256": signature,
};

const res = await fetch(`${BASE_URL}/api/webhooks/github`, { method: "POST", headers, body });
console.log("HTTP", res.status, await res.text());
const replay = await fetch(`${BASE_URL}/api/webhooks/github`, { method: "POST", headers, body });
console.log("REPLAY", replay.status, await replay.text());
const bad = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: "POST",
    headers: { ...headers, "x-github-delivery": randomUUID(), "x-hub-signature-256": "sha256=deadbeef" },
    body,
});
console.log("BADSIG", bad.status);

const event = await db.query(
    `SELECT kind, title FROM events WHERE "orgId"=$1 AND "dedupKey"=$2`,
    [org_id, `github:${delivery_id}`]
);
console.log(
    event.rowCount === 1
        ? `EVENT CREATED: ${event.rows[0].kind} — ${event.rows[0].title}`
        : "EVENT MISSING — FAIL"
);
await db.end();
process.exit(event.rowCount === 1 && bad.status === 401 ? 0 : 1);
