import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getConfig, liveModelConfigured } from "@/lib/config";
import { getSession } from "@/lib/session";
import { workerStatus } from "@/lib/domain/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb();
    const session = getSession();
    return NextResponse.json({
      ok: true,
      time: nowIso(),
      company: session.company.slug,
      backend: getConfig().agentBackend,
      liveModel: liveModelConfigured(),
      worker: workerStatus(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        hint: "Run `npm run db:seed` to create the demo company.",
      },
      { status: 503 },
    );
  }
}
