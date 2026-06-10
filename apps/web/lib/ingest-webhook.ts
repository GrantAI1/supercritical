import type { NormalizedEvent } from "@supercritical/core";
import { unseal } from "@supercritical/crypto";
import { isUniqueViolation, prisma, type Provider } from "@supercritical/db";

type HandlerOptions = {
  provider: Provider;
  raw_body: string;
  delivery_id: string | null;
  signature: string | null;
  verify: (secret: string, raw_body: string, signature: string | null) => boolean;
  resolve_account: (payload: unknown) => string | null;
  normalize: (payload: unknown) => NormalizedEvent | null;
};

export async function handleProviderWebhook(opts: HandlerOptions): Promise<Response> {
  const master_key = process.env.MASTER_KEY;
  if (!master_key) return new Response("MASTER_KEY not configured", { status: 500 });
  if (!opts.delivery_id) return new Response("missing delivery id", { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(opts.raw_body);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const account = opts.resolve_account(parsed);
  if (!account) return new Response("cannot resolve account", { status: 400 });

  const connection = await prisma.connection.findFirst({
    where: { provider: opts.provider, externalAccountId: account, status: "ACTIVE" }
  });
  if (!connection?.webhookSecretEnc) {
    return new Response("no matching connection", { status: 404 });
  }

  const secret = unseal(Buffer.from(connection.webhookSecretEnc), master_key);
  if (!opts.verify(secret, opts.raw_body, opts.signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  // Raw inbox first — replay returns 200 without reprocessing.
  try {
    await prisma.webhookDelivery.create({
      data: {
        provider: opts.provider,
        deliveryId: opts.delivery_id,
        connectionId: connection.id,
        signatureValid: true,
        payload: parsed as object
      }
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return Response.json({ ok: true, duplicate: true });
    throw err;
  }

  const delivery_where = {
    provider_deliveryId: { provider: opts.provider, deliveryId: opts.delivery_id }
  };

  const evt = opts.normalize(parsed);
  if (!evt) {
    await prisma.webhookDelivery.update({
      where: delivery_where,
      data: { processedAt: new Date(), error: "ignored: no normalizer for kind" }
    });
    return Response.json({ ok: true, ignored: true });
  }

  const service = await prisma.service.upsert({
    where: {
      connectionId_externalId: { connectionId: connection.id, externalId: evt.service_external_id }
    },
    create: {
      orgId: connection.orgId,
      connectionId: connection.id,
      provider: opts.provider,
      kind: evt.service_kind,
      externalId: evt.service_external_id,
      name: evt.service_name
    },
    update: { name: evt.service_name }
  });

  try {
    await prisma.event.create({
      data: {
        orgId: connection.orgId,
        serviceId: service.id,
        provider: opts.provider,
        kind: evt.kind,
        severity: evt.severity,
        title: evt.title,
        actor: evt.actor,
        isChangePoint: evt.is_change_point,
        dedupKey: evt.dedup_key,
        occurredAt: evt.occurred_at,
        payload: evt.payload as object,
        normalized: evt.normalized as object
      }
    });
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
  }

  await prisma.webhookDelivery.update({
    where: delivery_where,
    data: { processedAt: new Date() }
  });

  return Response.json({ ok: true, kind: evt.kind });
}
