import { fail, ok, readJson, unexpected } from "@/lib/api";
import { budgetSnapshot } from "@/lib/domain/budget";
import { getPolicies, recordActivity, setPolicy } from "@/lib/domain/repo";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = getSession();
    const policies = getPolicies(session.company.id);
    return ok({ budget: budgetSnapshot(session.company.id, policies) });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * The owner sets the figures. A monthly limit of 0 means "no ceiling": work is
 * still metered and shown, it just never reports an overrun. Real spending is
 * still an approval in policy.ts, so removing the ceiling does not remove the
 * gate in front of money.
 */
export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{ monthlyLimitCents?: number | null; autoApproveCents?: number | null }>(request);

    if (body.monthlyLimitCents === undefined && body.autoApproveCents === undefined) {
      return fail("Send a monthly limit, an auto-approval threshold, or both.");
    }

    const policies = getPolicies(session.company.id);

    if (body.monthlyLimitCents !== undefined) {
      const limit = body.monthlyLimitCents === null ? 0 : Number(body.monthlyLimitCents);
      if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(limit)) {
        return fail("The monthly limit must be a whole number of cents, or 0 for no ceiling.");
      }
      setPolicy(
        session.company.id,
        "budget.monthly_limit_cents",
        limit,
        limit === 0 ? "Company monthly spend ceiling: none." : "Company monthly spend ceiling in cents.",
      );
      recordActivity({
        companyId: session.company.id,
        actorType: "human",
        actorId: session.owner.id,
        type: "budget.updated",
        summary:
          limit === 0
            ? "Owner removed the monthly budget ceiling; spending is still metered and approved."
            : `Owner set the monthly budget ceiling to ${limit}¢.`,
      });
    }

    if (body.autoApproveCents !== undefined) {
      const threshold = body.autoApproveCents === null ? 0 : Number(body.autoApproveCents);
      if (!Number.isFinite(threshold) || threshold < 0 || !Number.isInteger(threshold)) {
        return fail("The auto-approval threshold must be a whole number of cents.");
      }
      setPolicy(
        session.company.id,
        "budget.auto_approve_cents",
        threshold,
        "Spend at or below this is inside delegated authority.",
      );
      recordActivity({
        companyId: session.company.id,
        actorType: "human",
        actorId: session.owner.id,
        type: "budget.updated",
        summary: `Owner set the auto-approval threshold to ${threshold}¢.`,
      });
    }

    const updated = getPolicies(session.company.id);
    return ok({ budget: budgetSnapshot(session.company.id, updated) });
  } catch (error) {
    return unexpected(error);
  }
}
