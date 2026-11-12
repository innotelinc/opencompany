import { getConfig } from "@/lib/config";
import { addLedgerEntry, getCompany, ledgerTotals, listLedgerForRun, setPolicy, supersedeLedgerEntry } from "@/lib/domain/repo";

export interface BudgetSnapshot {
  estimatedCents: number;
  recordedCents: number;
  verifiedCents: number;
  committedCents: number;
  limitCents: number;
  /** A limit of 0 means the owner removed the ceiling; spending is still metered. */
  unlimited: boolean;
  remainingCents: number;
  modelTokensIn: number;
  modelTokensOut: number;
}

export function budgetSnapshot(companyId: string, policies: Record<string, unknown> = {}): BudgetSnapshot {
  const totals = ledgerTotals(companyId);
  const limitCents = Number(
    policies["budget.monthly_limit_cents"] ?? getConfig().limits.monthlyBudgetCents,
  );
  const committedCents =
    totals.estimatedCents + totals.recordedCents + totals.verifiedCents + totals.expenseCents;
  return {
    estimatedCents: totals.estimatedCents,
    recordedCents: totals.recordedCents,
    verifiedCents: totals.verifiedCents,
    committedCents,
    limitCents,
    unlimited: limitCents <= 0,
    remainingCents: limitCents <= 0 ? 0 : Math.max(0, limitCents - committedCents),
    modelTokensIn: totals.modelTokensIn,
    modelTokensOut: totals.modelTokensOut,
  };
}

/**
 * Virtual budget is bookkeeping, never a stop sign.
 *
 * Estimates and token usage are not charges, so crossing the monthly figure is
 * reported as a warning and dispatch continues. The only thing that actually
 * spends money is paying an external party, and that is an owner approval in
 * policy.ts rather than a cap on the team.
 */
export function canDispatch(
  companyId: string,
  estimateCents: number,
  policies: Record<string, unknown> = {},
): { ok: true; warning?: string; snapshot: BudgetSnapshot } {
  const snapshot = budgetSnapshot(companyId, policies);
  const projected = snapshot.committedCents + estimateCents;
  const warning =
    !snapshot.unlimited && projected > snapshot.limitCents
      ? `Virtual budget ${projected}¢ is past the ${snapshot.limitCents}¢ figure; nothing was charged and work continues.`
      : undefined;
  return { ok: true, warning, snapshot };
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
  setPolicy(companyId, "budget.monthly_limit_cents", limits.monthlyBudgetCents, "Company monthly spend ceiling in cents.");
  setPolicy(companyId, "budget.auto_approve_cents", limits.autoApproveCents, "Spend at or below this is inside delegated authority.");
}
