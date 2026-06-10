"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { seal } from "@supercritical/crypto";
import { isUniqueViolation, prisma } from "@supercritical/db";
import { requireOrg } from "@/lib/org";

export type CreateConnectionState = {
  ok: boolean;
  error?: string;
  secret?: string;
  webhook_path?: string;
};

const VALID_PROVIDERS = ["GITHUB", "VERCEL"] as const;

export async function createConnection(
  _prev: CreateConnectionState,
  form_data: FormData
): Promise<CreateConnectionState> {
  const org = await requireOrg();
  const provider = String(form_data.get("provider"));
  const external_account_id = String(form_data.get("externalAccountId") ?? "").trim();

  if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
    return { ok: false, error: "invalid provider" };
  }
  if (!external_account_id) {
    return { ok: false, error: "account id required" };
  }

  const master_key = process.env.MASTER_KEY;
  if (!master_key) return { ok: false, error: "MASTER_KEY not configured" };

  const secret = randomBytes(32).toString("hex");
  try {
    await prisma.connection.create({
      data: {
        orgId: org.id,
        provider: provider as "GITHUB" | "VERCEL",
        status: "ACTIVE",
        externalAccountId: external_account_id,
        webhookSecretEnc: new Uint8Array(seal(secret, master_key)),
        scopes: []
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "connection already exists for this account" };
    }
    throw err;
  }

  revalidatePath("/dashboard/settings/connections");
  return { ok: true, secret, webhook_path: `/api/webhooks/${provider.toLowerCase()}` };
}
