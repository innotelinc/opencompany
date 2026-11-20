import { getSession } from "@/lib/session";
import { ok, unexpected } from "@/lib/api";
import { pendingApprovalViews } from "@/lib/domain/approvals";
import { smtpConfigured } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the popup watches. It is deliberately small and reads only the decisions
 * that are still waiting, so a two-second poll costs less than the activity feed
 * the shell already polls.
 */
export async function GET() {
  try {
    const session = await getSession();
    return ok({
      pending: pendingApprovalViews(session.company.id),
      email: smtpConfigured(),
    });
  } catch (error) {
    return unexpected(error);
  }
}
