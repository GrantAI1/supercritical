import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function loadKey(master_key_b64: string): Buffer {
  const key = Buffer.from(master_key_b64, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("MASTER_KEY must be 32 bytes base64");
  }
  return key;
}

// Layout: iv (12) | auth tag (16) | ciphertext
export function seal(plaintext: string, master_key_b64: string): Buffer {
  const key = loadKey(master_key_b64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function unseal(sealed: Buffer, master_key_b64: string): string {
  const key = loadKey(master_key_b64);
  const iv = sealed.subarray(0, IV_LENGTH);
  const tag = sealed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = sealed.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
