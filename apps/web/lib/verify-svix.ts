import { Webhook } from "svix";

export type SvixHeaders = Record<string, string>;

// Throws on invalid signature/timestamp. Returns the parsed event payload.
export function verifyClerkWebhook(
    secret: string,
    payload: string,
    headers: SvixHeaders
): unknown {
    return new Webhook(secret).verify(payload, headers);
}
