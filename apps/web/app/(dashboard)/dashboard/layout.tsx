import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");

    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex items-center justify-between border-b border-terminal-grid px-4 py-2 text-xs">
                <span className="tracking-[0.2em] text-terminal-amber">
                    SUPERCRITICAL
                </span>
                <div className="flex items-center gap-4">
                    <span className="text-terminal-dim">
                        0 SERVICES · 0 OPEN INCIDENTS
                    </span>
                    <UserButton />
                </div>
            </header>
            <main className="flex-1 p-4">{children}</main>
        </div>
    );
}
