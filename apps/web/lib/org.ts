import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@supercritical/db";

// Personal accounts (no active Clerk org) get a synthetic org.
export async function getOrgOrNull() {
    const { userId, orgId } = await auth();
    if (!userId) return null;
    const clerk_org_id = orgId ?? `personal_${userId}`;
    return prisma.organization.upsert({
        where: { clerkOrgId: clerk_org_id },
        create: {
            clerkOrgId: clerk_org_id,
            name: orgId ? "Organization" : "Personal",
        },
        update: {},
    });
}

export async function requireOrg() {
    const org = await getOrgOrNull();
    if (!org) redirect("/sign-in");
    return org;
}
