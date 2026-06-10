import { headers } from "next/headers";
import {
  normalizeGithub,
  resolveGithubAccount,
  verifyGithubSignature
} from "@supercritical/ingest";
import { handleProviderWebhook } from "@/lib/ingest-webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw_body = await req.text();
  const header_store = headers();
  const delivery_id = header_store.get("x-github-delivery");
  const event_name = header_store.get("x-github-event") ?? "";

  return handleProviderWebhook({
    provider: "GITHUB",
    raw_body,
    delivery_id,
    signature: header_store.get("x-hub-signature-256"),
    verify: verifyGithubSignature,
    resolve_account: resolveGithubAccount,
    normalize: (payload) => normalizeGithub(event_name, delivery_id ?? "", payload)
  });
}
