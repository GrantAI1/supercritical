import { headers } from "next/headers";
import {
  normalizeVercel,
  resolveVercelAccount,
  verifyVercelSignature
} from "@supercritical/ingest";
import { handleProviderWebhook } from "@/lib/ingest-webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw_body = await req.text();
  const header_store = headers();

  let envelope_id: string | null = null;
  try {
    envelope_id = (JSON.parse(raw_body) as { id?: string }).id ?? null;
  } catch {
    envelope_id = null;
  }

  return handleProviderWebhook({
    provider: "VERCEL",
    raw_body,
    delivery_id: envelope_id,
    signature: header_store.get("x-vercel-signature"),
    verify: verifyVercelSignature,
    resolve_account: resolveVercelAccount,
    normalize: normalizeVercel
  });
}
