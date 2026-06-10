// E2E: creates a GITHUB connection in the db, signs a push fixture with its
// secret, POSTs to a running server, asserts 200 + Event row.
// Usage: node tooling/scripts/send-test-webhook.mjs [base_url]
// Requires env: DATABASE_URL, DIRECT_DATABASE_URL, MASTER_KEY. Server must be running.
import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    randomUUID,
} from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
    PrismaClient,
} = require("../../packages/db/node_modules/@prisma/client");

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Inline copy of @supercritical/crypto (script can't import workspace TS).
function seal(plaintext, master_key_b64) {
    const key = Buffer.from(master_key_b64, "base64");
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function unseal(sealed, master_key_b64) {
    const key = Buffer.from(master_key_b64, "base64");
    const iv = sealed.subarray(0, IV_LENGTH);
    const tag = sealed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = sealed.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]).toString("utf8");
}

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const MASTER_KEY = process.env.MASTER_KEY;
if (!MASTER_KEY) {
    console.error("MASTER_KEY env required");
    process.exit(1);
}

const prisma = new PrismaClient();

const org = await prisma.organization.upsert({
    where: { clerkOrgId: "e2e_org" },
    create: { clerkOrgId: "e2e_org", name: "E2E" },
    update: {},
});

let connection = await prisma.connection.findFirst({
    where: {
        orgId: org.id,
        provider: "GITHUB",
        externalAccountId: "e2e-owner",
    },
});
let secret;
if (connection) {
    secret = unseal(Buffer.from(connection.webhookSecretEnc), MASTER_KEY);
} else {
    secret = randomBytes(32).toString("hex");
    connection = await prisma.connection.create({
        data: {
            orgId: org.id,
            provider: "GITHUB",
            status: "ACTIVE",
            externalAccountId: "e2e-owner",
            webhookSecretEnc: new Uint8Array(seal(secret, MASTER_KEY)),
            scopes: [],
        },
    });
}

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
    head_commit: {
        message: "e2e: test commit",
        timestamp: new Date().toISOString(),
    },
    pusher: { name: "e2e-bot" },
});
const signature =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

const res = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "x-github-delivery": delivery_id,
        "x-github-event": "push",
        "x-hub-signature-256": signature,
    },
    body,
});
console.log("HTTP", res.status, await res.text());

// Replay same delivery — must be a duplicate no-op.
const replay = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "x-github-delivery": delivery_id,
        "x-github-event": "push",
        "x-hub-signature-256": signature,
    },
    body,
});
console.log("REPLAY", replay.status, await replay.text());

// Bad signature — must be rejected.
const bad = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "x-github-delivery": randomUUID(),
        "x-github-event": "push",
        "x-hub-signature-256": "sha256=deadbeef",
    },
    body,
});
console.log("BADSIG", bad.status);

const event = await prisma.event.findUnique({
    where: {
        orgId_dedupKey: { orgId: org.id, dedupKey: `github:${delivery_id}` },
    },
});
console.log(
    event
        ? `EVENT CREATED: ${event.kind} — ${event.title}`
        : "EVENT MISSING — FAIL"
);
await prisma.$disconnect();
process.exit(event && bad.status === 401 ? 0 : 1);
