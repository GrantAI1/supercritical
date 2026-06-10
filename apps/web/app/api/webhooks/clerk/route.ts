import { headers } from "next/headers";
import { prisma } from "@supercritical/db";
import { verifyClerkWebhook } from "@/lib/verify-svix";
import {
    applyClerkEvent,
    type ClerkEvent,
    type OrgBootstrapDb,
} from "@/lib/org-bootstrap";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        return new Response("webhook secret not configured", { status: 500 });
    }

    const payload = await req.text();
    const header_store = headers();

    let evt: ClerkEvent;
    try {
        evt = verifyClerkWebhook(secret, payload, {
            "svix-id": header_store.get("svix-id") ?? "",
            "svix-timestamp": header_store.get("svix-timestamp") ?? "",
            "svix-signature": header_store.get("svix-signature") ?? "",
        }) as ClerkEvent;
    } catch {
        return new Response("invalid signature", { status: 401 });
    }

    const result = await applyClerkEvent(
        prisma as unknown as OrgBootstrapDb,
        evt
    );
    return Response.json({ ok: true, ...result });
}
