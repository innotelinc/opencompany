import { fail, ok, readJson, unexpected } from "@/lib/api";
import { budgetSnapshot } from "@/lib/domain/budget";
import { getPolicies, recordActivity, setPolicy } from "@/lib/domain/repo";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const policies = getPolicies(session.company.id);
    return ok({ budget: budgetSnapshot(session.company.id, policies) });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * The owner sets the yearly budget. It is measured monthly and adjusted
 * quarterly on performance.
 *
 * A budget of 0 means "no budget": work is still metered and reported, and
 * nothing changes about what gets done. There is no ceiling and no per-call
 * budget — every task or goal that is set has to be completed.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    const body = await readJson<{ annualBudgetCents?: number | null; monthlyLimitCents?: number | null }>(
      request,
    );

    if (body.annualBudgetCents === undefined && body.monthlyLimitCents === undefined) {
      return fail("Send a yearly budget, or 0 to remove it.");
    }

    // Older clients sent a monthly figure; twelve months is the yearly budget.
    const raw = body.annualBudgetCents ?? (body.monthlyLimitCents ?? 0) * 12;
    const annual = raw === null ? 0 : Number(raw);
    if (!Number.isFinite(annual) || annual < 0 || !Number.isInteger(annual)) {
      return fail("The budget must be a whole number of cents, or 0 for no budget.");
    }

    setPolicy(
      session.company.id,
      "budget.annual_limit_cents",
      annual,
      annual === 0
        ? "Yearly budget: none. Spend is recorded and reported."
        : "Yearly budget in cents. Measured monthly, adjusted quarterly; never a ceiling.",
    );
    recordActivity({
      companyId: session.company.id,
      actorType: "human",
      actorId: session.owner.id,
      type: "budget.updated",
      summary:
        annual === 0
          ? "Owner removed the yearly budget; spend is still recorded."
          : `Owner set the yearly budget to ${annual}¢ (measured monthly, adjusted quarterly).`,
    });

    const updated = getPolicies(session.company.id);
    return ok({ budget: budgetSnapshot(session.company.id, updated) });
  } catch (error) {
    return unexpected(error);
  }
}
