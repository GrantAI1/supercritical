import { describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { verifyClerkWebhook } from "./verify-svix";

const TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

function signPayload(payload: string): Record<string, string> {
    const wh = new Webhook(TEST_SECRET);
    const msg_id = "msg_test_1";
    const timestamp = new Date();
    const signature = wh.sign(msg_id, timestamp, payload);
    return {
        "svix-id": msg_id,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": signature,
    };
}

describe("verifyClerkWebhook", () => {
    it("accepts a correctly signed payload", () => {
        const payload = JSON.stringify({
            type: "organization.created",
            data: { id: "org_1" },
        });
        const evt = verifyClerkWebhook(
            TEST_SECRET,
            payload,
            signPayload(payload)
        );
        expect((evt as { type: string }).type).toBe("organization.created");
    });

    it("rejects a tampered payload", () => {
        const payload = JSON.stringify({
            type: "organization.created",
            data: { id: "org_1" },
        });
        const headers = signPayload(payload);
        expect(() =>
            verifyClerkWebhook(
                TEST_SECRET,
                payload.replace("org_1", "org_2"),
                headers
            )
        ).toThrow();
    });
});
