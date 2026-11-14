import { getConfig } from "@/lib/config";
import {
  addLedgerEntry,
  getCompany,
  ledgerTotals,
  listLedgerForRun,
  setPolicy,
  spendCentsSince,
  supersedeLedgerEntry,
} from "@/lib/domain/repo";

export interface BudgetSnapshot {
  /** The yearly budget the owner set, in cents. */
  annualLimitCents: number;
  /** One twelfth of the yearly budget: what a month looks like on pace. */
  monthlyGuideCents: number;
  /** One quarter of the yearly budget: the figure the quarterly review compares. */
  quarterGuideCents: number;
  /** Spend recorded since the first of this month. */
  monthSpentCents: number;
  /** Spend recorded since the first day of this quarter. */
  quarterSpentCents: number;
  estimatedCents: number;
  recordedCents: number;
  verifiedCents: number;
  committedCents: number;
  /** A budget of 0 means the owner removed the figure; spending is still metered. */
  unlimited: boolean;
  modelTokensIn: number;
  modelTokensOut: number;
}

function monthStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function quarterStart(now: Date = new Date()): string {
  const firstMonthOfQuarter = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), firstMonthOfQuarter, 1)).toISOString();
}

export function budgetSnapshot(companyId: string, policies: Record<string, unknown> = {}): BudgetSnapshot {
  const totals = ledgerTotals(companyId);
  // Companies seeded before the budget was yearly still carry a monthly figure;
  // twelve months of it is the yearly budget they meant.
  const legacyMonthly = policies["budget.monthly_limit_cents"];
  const annualLimitCents = Number(
    policies["budget.annual_limit_cents"] ??
      (legacyMonthly !== undefined ? Number(legacyMonthly) * 12 : getConfig().limits.annualBudgetCents),
  );
  const committedCents =
    totals.estimatedCents + totals.recordedCents + totals.verifiedCents + totals.expenseCents;
  return {
    annualLimitCents,
    monthlyGuideCents: annualLimitCents <= 0 ? 0 : Math.round(annualLimitCents / 12),
    quarterGuideCents: annualLimitCents <= 0 ? 0 : Math.round(annualLimitCents / 4),
    monthSpentCents: spendCentsSince(companyId, monthStart()),
    quarterSpentCents: spendCentsSince(companyId, quarterStart()),
    estimatedCents: totals.estimatedCents,
    recordedCents: totals.recordedCents,
    verifiedCents: totals.verifiedCents,
    committedCents,
    unlimited: annualLimitCents <= 0,
    modelTokensIn: totals.modelTokensIn,
    modelTokensOut: totals.modelTokensOut,
  };
}

/**
 * There is no ceiling and there is no per-call budget.
 *
 * A budget is a yearly planning figure the owner sets or removes. It is measured
 * monthly and adjusted quarterly on performance; it is a recording of what was
 * spent, never a gate. No task, goal or plan is stopped, throttled or warned
 * about by it, and any task or goal that is set has to be completed. The only
 * real money gate is an external payment, which stays an owner approval in
 * policy.ts.
 */
export function canDispatch(
  companyId: string,
  _estimateCents: number,
  policies: Record<string, unknown> = {},
): { ok: true; snapshot: BudgetSnapshot } {
  return { ok: true, snapshot: budgetSnapshot(companyId, policies) };
}

/** Reserve an estimate before dispatch. Estimates are visibly separate from usage. */
export function reserveEstimate(input: {
  companyId: string;
  employeeId: string;
  taskId: string;
  runId: string;
  amountCents: number;
  description: string;
}): { entryId: string } {
  const entry = addLedgerEntry({
    companyId: input.companyId,
    employeeId: input.employeeId,
    taskId: input.taskId,
    runId: input.runId,
    kind: "estimated",
    category: "model",
    amountCents: input.amountCents,
    description: input.description,
    provider: "estimate",
  });
  return { entryId: entry.id };
}

/**
 * Replace this run's reservations with recorded usage. Recorded usage is what
 * we actually know: tokens, and cents only where a price is configured. We never
 * invent a provider charge.
 */
export function settleRunUsage(input: {
  companyId: string;
  runId: string;
  actualCents: number;
  tokensIn: number;
  tokensOut: number;
  description: string;
}): void {
  const recorded = addLedgerEntry({
    companyId: input.companyId,
    runId: input.runId,
    kind: "recorded",
    category: "model",
    amountCents: input.actualCents,
    description: input.description,
    provider: input.actualCents > 0 ? "model" : "unpriced",
  });
  for (const entry of listLedgerForRun(input.companyId, input.runId)) {
    if (entry.kind === "estimated" && !entry.supersededBy) {
      supersedeLedgerEntry(input.companyId, entry.id, recorded.id);
    }
  }
}

/** Demo mode is real work with no model cost; record that fact rather than a fake charge. */
export function recordSimulatedUsage(companyId: string, runId: string, note: string): void {
  addLedgerEntry({
    companyId,
    runId,
    kind: "recorded",
    category: "other",
    amountCents: 0,
    description: `Simulated run — no provider charge. ${note}`,
    provider: "none",
  });
}

export function ensureBudgetPolicy(companyId: string, limits: ReturnType<typeof getConfig>["limits"]): void {
  const company = getCompany(companyId);
  if (!company) return;
  setPolicy(
    companyId,
    "budget.annual_limit_cents",
    limits.annualBudgetCents,
    "Yearly budget in cents. Measured monthly, adjusted quarterly; never a ceiling.",
  );
}
