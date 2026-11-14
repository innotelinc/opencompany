import { getConfig } from "@/lib/config";
import {
  addLedgerEntry,
  getCompany,
  ledgerTotals,
  listLedgerForRun,
  setPolicy,
  spendBetween,
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

/**
 * The yearly budget in cents.
 *
 * Companies seeded before the budget was yearly still carry a monthly figure;
 * twelve months of it is the yearly budget they meant.
 */
export function resolveAnnualLimit(policies: Record<string, unknown> = {}): number {
  const legacyMonthly = policies["budget.monthly_limit_cents"];
  return Number(
    policies["budget.annual_limit_cents"] ??
      (legacyMonthly !== undefined ? Number(legacyMonthly) * 12 : getConfig().limits.annualBudgetCents),
  );
}

export function budgetSnapshot(companyId: string, policies: Record<string, unknown> = {}): BudgetSnapshot {
  const totals = ledgerTotals(companyId);
  const annualLimitCents = resolveAnnualLimit(policies);
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

export interface QuarterLine {
  quarter: number;
  label: string;
  fromIso: string;
  toIso: string;
  spentCents: number;
  entries: number;
  /** One quarter of the yearly budget. */
  paceCents: number;
  state: "closed" | "current" | "upcoming";
}

export interface QuarterReview {
  year: number;
  annualLimitCents: number;
  quarterGuideCents: number;
  unlimited: boolean;
  quarters: QuarterLine[];
  /** Spend recorded in the quarters that have finished, plus the current one so far. */
  yearToDateCents: number;
  /** The same window of the yearly budget: closed quarters at full pace, the current one prorated. */
  paceToDateCents: number;
}

const QUARTER_MONTHS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

/**
 * The quarterly review: what each quarter recorded against a quarter of the
 * yearly budget. It is a comparison, not a check — nothing here stops work.
 */
export function quarterReview(
  companyId: string,
  policies: Record<string, unknown> = {},
  now: Date = new Date(),
): QuarterReview {
  const year = now.getUTCFullYear();
  const annualLimitCents = resolveAnnualLimit(policies);
  const paceCents = annualLimitCents <= 0 ? 0 : Math.round(annualLimitCents / 4);
  const currentQuarter = Math.floor(now.getUTCMonth() / 3);
  const quarters: QuarterLine[] = [0, 1, 2, 3].map((index) => {
    const fromIso = new Date(Date.UTC(year, index * 3, 1)).toISOString();
    const toIso = new Date(Date.UTC(year, index * 3 + 3, 1)).toISOString();
    const { cents, entries } = spendBetween(companyId, fromIso, toIso);
    return {
      quarter: index + 1,
      label: `Q${index + 1} · ${QUARTER_MONTHS[index]}`,
      fromIso,
      toIso,
      spentCents: cents,
      entries,
      paceCents,
      state: index < currentQuarter ? "closed" : index === currentQuarter ? "current" : "upcoming",
    };
  });

  const yearToDateCents = quarters
    .filter((line) => line.state !== "upcoming")
    .reduce((sum, line) => sum + line.spentCents, 0);
  const quarterLengthMs = 1000 * 60 * 60 * 24 * 91;
  const elapsedInQuarter = Math.min(
    1,
    Math.max(0, (now.getTime() - Date.parse(quarters[currentQuarter].fromIso)) / quarterLengthMs),
  );
  const paceToDateCents = Math.round(currentQuarter * paceCents + paceCents * elapsedInQuarter);

  return {
    year,
    annualLimitCents,
    quarterGuideCents: paceCents,
    unlimited: annualLimitCents <= 0,
    quarters,
    yearToDateCents,
    paceToDateCents,
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
