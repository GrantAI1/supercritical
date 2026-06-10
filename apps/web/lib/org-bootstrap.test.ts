import { describe, expect, it } from "vitest";
import { applyClerkEvent, type OrgBootstrapDb } from "./org-bootstrap";

function makeFakeDb() {
    const calls: { model: string; op: string; args: unknown }[] = [];
    const fake_db: OrgBootstrapDb = {
        organization: {
            async upsert(args) {
                calls.push({ model: "organization", op: "upsert", args });
                return { id: "db_org_1" };
            },
        },
        user: {
            async upsert(args) {
                calls.push({ model: "user", op: "upsert", args });
                return {};
            },
        },
    };
    return { fake_db, calls };
}

describe("applyClerkEvent", () => {
    it("organization.created upserts an Organization by clerkOrgId", async () => {
        const { fake_db, calls } = makeFakeDb();
        const result = await applyClerkEvent(fake_db, {
            type: "organization.created",
            data: { id: "org_clerk_1", name: "Acme" },
        });
        expect(result.handled).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            model: "organization",
            op: "upsert",
            args: {
                where: { clerkOrgId: "org_clerk_1" },
                create: { clerkOrgId: "org_clerk_1", name: "Acme" },
                update: { name: "Acme" },
            },
        });
    });

    it("organizationMembership.created ensures org then upserts User with org id", async () => {
        const { fake_db, calls } = makeFakeDb();
        const result = await applyClerkEvent(fake_db, {
            type: "organizationMembership.created",
            data: {
                organization: { id: "org_clerk_1", name: "Acme" },
                public_user_data: {
                    user_id: "user_clerk_1",
                    identifier: "a@acme.dev",
                },
                role: "org:admin",
            },
        });
        expect(result.handled).toBe(true);
        expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
            "organization.upsert",
            "user.upsert",
        ]);
        expect(calls[1].args).toMatchObject({
            where: { clerkUserId: "user_clerk_1" },
            create: {
                clerkUserId: "user_clerk_1",
                orgId: "db_org_1",
                email: "a@acme.dev",
                role: "org:admin",
            },
            update: { role: "org:admin" },
        });
    });

    it("ignores unknown event types", async () => {
        const { fake_db, calls } = makeFakeDb();
        const result = await applyClerkEvent(fake_db, {
            type: "session.created",
            data: {},
        });
        expect(result.handled).toBe(false);
        expect(calls).toHaveLength(0);
    });
});
