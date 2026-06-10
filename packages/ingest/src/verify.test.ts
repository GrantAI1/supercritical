import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGithubSignature, verifyVercelSignature } from "./verify";

const SECRET = "test_webhook_secret";
const BODY = JSON.stringify({ hello: "world" });

describe("verifyGithubSignature", () => {
  it("accepts a valid sha256 signature", () => {
    const sig = "sha256=" + createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(verifyGithubSignature(SECRET, BODY, sig)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const sig = "sha256=" + createHmac("sha256", "other").update(BODY).digest("hex");
    expect(verifyGithubSignature(SECRET, BODY, sig)).toBe(false);
  });

  it("rejects malformed header", () => {
    expect(verifyGithubSignature(SECRET, BODY, "garbage")).toBe(false);
    expect(verifyGithubSignature(SECRET, BODY, null)).toBe(false);
  });
});

describe("verifyVercelSignature", () => {
  it("accepts a valid sha1 signature", () => {
    const sig = createHmac("sha1", SECRET).update(BODY).digest("hex");
    expect(verifyVercelSignature(SECRET, BODY, sig)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const sig = createHmac("sha1", "other").update(BODY).digest("hex");
    expect(verifyVercelSignature(SECRET, BODY, sig)).toBe(false);
  });

  it("rejects null header", () => {
    expect(verifyVercelSignature(SECRET, BODY, null)).toBe(false);
  });
});
