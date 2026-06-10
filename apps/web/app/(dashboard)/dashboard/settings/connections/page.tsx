import { prisma } from "@supercritical/db";
import { requireOrg } from "@/lib/org";
import { NewConnectionForm } from "./new-connection-form";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const org = await requireOrg();
  const connections = await prisma.connection.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, provider: true, externalAccountId: true, status: true, createdAt: true }
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-sm tracking-[0.2em] text-terminal-amber">CONNECTIONS</h1>
      <table className="w-full text-left text-xs">
        <thead className="text-terminal-dim">
          <tr className="border-b border-terminal-grid">
            <th className="py-1 pr-4 font-normal">PROVIDER</th>
            <th className="py-1 pr-4 font-normal">ACCOUNT</th>
            <th className="py-1 pr-4 font-normal">STATUS</th>
            <th className="py-1 font-normal">WEBHOOK PATH</th>
          </tr>
        </thead>
        <tbody>
          {connections.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-terminal-dim">
                NO CONNECTIONS — add one below, then point the provider webhook at the URL.
              </td>
            </tr>
          )}
          {connections.map((c: any) => (
            <tr key={c.id} className="border-b border-terminal-grid hover:bg-neutral-900/60">
              <td className="py-1 pr-4">{c.provider}</td>
              <td className="py-1 pr-4">{c.externalAccountId}</td>
              <td className="py-1 pr-4 text-terminal-green">{c.status}</td>
              <td className="py-1 text-terminal-dim">/api/webhooks/{c.provider.toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewConnectionForm />
    </div>
  );
}
