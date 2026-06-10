import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { seal, unseal } from "./index";

const MASTER_KEY = randomBytes(32).toString("base64");

describe("seal/unseal", () => {
  it("roundtrips a secret", () => {
    const sealed = seal("whsec_topsecret", MASTER_KEY);
    expect(unseal(sealed, MASTER_KEY)).toBe("whsec_topsecret");
  });

  it("produces different ciphertexts for the same plaintext (fresh IV)", () => {
    expect(seal("x", MASTER_KEY).equals(seal("x", MASTER_KEY))).toBe(false);
  });

  it("throws on tampered ciphertext", () => {
    const sealed = seal("x", MASTER_KEY);
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => unseal(sealed, MASTER_KEY)).toThrow();
  });

  it("throws on wrong key", () => {
    const sealed = seal("x", MASTER_KEY);
    expect(() => unseal(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});
