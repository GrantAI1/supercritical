export type OrgBootstrapDb = {
    organization: {
        upsert(args: {
            where: { clerkOrgId: string };
            create: { clerkOrgId: string; name: string };
            update: { name: string };
        }): Promise<{ id: string }>;
    };
    user: {
        upsert(args: {
            where: { clerkUserId: string };
            create: {
                clerkUserId: string;
                orgId: string;
                email: string;
                role: string;
            };
            update: { role: string };
        }): Promise<unknown>;
    };
};

export type ClerkEvent = { type: string; data: unknown };

type ClerkOrgData = { id: string; name: string };
type ClerkMembershipData = {
    organization: ClerkOrgData;
    public_user_data: { user_id: string; identifier: string };
    role: string;
};

async function upsertOrg(
    db: OrgBootstrapDb,
    org: ClerkOrgData
): Promise<{ id: string }> {
    return db.organization.upsert({
        where: { clerkOrgId: org.id },
        create: { clerkOrgId: org.id, name: org.name },
        update: { name: org.name },
    });
}

export async function applyClerkEvent(
    db: OrgBootstrapDb,
    evt: ClerkEvent
): Promise<{ handled: boolean; action?: string }> {
    switch (evt.type) {
        case "organization.created":
        case "organization.updated": {
            await upsertOrg(db, evt.data as ClerkOrgData);
            return { handled: true, action: "org.upsert" };
        }
        case "organizationMembership.created": {
            const data = evt.data as ClerkMembershipData;
            // Webhook ordering is not guaranteed — membership may arrive before organization.created.
            const org = await upsertOrg(db, data.organization);
            await db.user.upsert({
                where: { clerkUserId: data.public_user_data.user_id },
                create: {
                    clerkUserId: data.public_user_data.user_id,
                    orgId: org.id,
                    email: data.public_user_data.identifier,
                    role: data.role,
                },
                update: { role: data.role },
            });
            return { handled: true, action: "membership.upsert" };
        }
        default:
            return { handled: false };
    }
}
