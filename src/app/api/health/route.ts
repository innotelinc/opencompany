import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getConfig, liveModelConfigured } from "@/lib/config";
import { tryGetSession } from "@/lib/session";
import { workerStatus } from "@/lib/domain/ops";
import { getProviderHealth } from "@/lib/domain/provider";
import { approvalLinksEnabled } from "@/lib/domain/approvals";
import { smtpConfigured } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness for a monitor, deliberately reachable without a session.
 *
 * It says whether the database opens, which company the process serves and
 * whether the worker is breathing; provider detail and the company's data stay
 * behind sign-in, so an unauthenticated caller gets the same answer minus
 * anything about the business.
 */
export async function GET() {
  try {
    getDb();
    const session = await tryGetSession();
    return NextResponse.json({
      ok: true,
      time: nowIso(),
      company: session?.company.slug ?? getConfig().companySlug,
      authenticated: Boolean(session),
      backend: getConfig().agentBackend,
      liveModel: liveModelConfigured(),
      worker: workerStatus(),
      // Whether the owner can be reached away from the console: the popup needs
      // nothing, the email needs a relay and a signing secret.
      approvals: { links: approvalLinksEnabled(), email: smtpConfigured() },
      provider: session ? getProviderHealth(session.company.id) : null,
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
