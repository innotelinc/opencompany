import { getSession } from "@/lib/session";
import { ok, unexpected } from "@/lib/api";
import { ownerAwaySeconds, pendingApprovalViews, recordOwnerPresence } from "@/lib/domain/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The open console says "I am here" every few seconds. The worker reads that row
 * to decide whether an approval needs an email, so this is the difference between
 * a popup and a message in the owner's inbox.
 */
export async function POST() {
  try {
    const session = await getSession();
    recordOwnerPresence(session.company.id, session.owner.id);
    return ok({ at: new Date().toISOString() });
  } catch (error) {
    return unexpected(error);
  }
}

export async function GET() {
  try {
    const session = await getSession();
    return ok({
      awaySeconds: ownerAwaySeconds(session.company.id, session.owner.id),
      pending: pendingApprovalViews(session.company.id).length,
    });
  } catch (error) {
    return unexpected(error);
  }
}
