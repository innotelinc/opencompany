import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listActivity, listRunEvents } from "@/lib/domain/repo";
import { workerStatus } from "@/lib/domain/ops";
import { unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = getSession();
    return NextResponse.json({
      ok: true,
      activity: listActivity(session.company.id, 40),
      runEvents: listRunEvents(session.company.id, { limit: 40 }),
      worker: workerStatus(),
      halted: session.company.haltedAt,
    });
  } catch (error) {
    return unexpected(error);
  }
}
