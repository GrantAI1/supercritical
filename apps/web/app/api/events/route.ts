import { NextRequest } from "next/server";
import { prisma } from "@supercritical/db";
import { getOrgOrNull } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const org = await getOrgOrNull();
  if (!org) return new Response("unauthorized", { status: 401 });

  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get("limit") ?? 50) || 50, MAX_LIMIT);

  const events = await prisma.event.findMany({
    where: { orgId: org.id },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      provider: true,
      kind: true,
      severity: true,
      title: true,
      actor: true,
      isChangePoint: true,
      occurredAt: true,
      service: { select: { name: true } }
    }
  });

  return Response.json({
    events: events.map((e) => ({
      id: e.id,
      source: e.provider,
      kind: e.kind,
      severity: e.severity,
      title: e.title,
      actor: e.actor,
      is_change_point: e.isChangePoint,
      occurred_at: e.occurredAt.toISOString(),
      service: e.service.name
    }))
  });
}
