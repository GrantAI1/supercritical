import { createHmac, timingSafeEqual } from "node:crypto";

function safeHexEqual(a: string, b: string): boolean {
    const buf_a = Buffer.from(a, "utf8");
    const buf_b = Buffer.from(b, "utf8");
    return buf_a.length === buf_b.length && timingSafeEqual(buf_a, buf_b);
}

// GitHub: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 hex of raw body.
export function verifyGithubSignature(
    secret: string,
    raw_body: string,
    header: string | null
): boolean {
    if (!header || !header.startsWith("sha256=")) return false;
    const expected =
        "sha256=" + createHmac("sha256", secret).update(raw_body).digest("hex");
    return safeHexEqual(expected, header);
}

// Vercel: x-vercel-signature = HMAC-SHA1 hex of raw body (vercel.com/docs/webhooks/webhooks-api).
export function verifyVercelSignature(
    secret: string,
    raw_body: string,
    header: string | null
): boolean {
    if (!header) return false;
    const expected = createHmac("sha1", secret).update(raw_body).digest("hex");
    return safeHexEqual(expected, header);
}
