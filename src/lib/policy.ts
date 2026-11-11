import type { Company, Employee } from "@/lib/domain/types";
import type { AppConfig } from "@/lib/config";

/**
 * Authority model (server-enforced, mirrors OpenBot's action-policy ordering:
 * safety first, then company rules, then the employee's own limits).
 *
 *   observe          read + propose only
 *   internal         may do internal work: write files, run allowed commands,
 *                    read knowledge they are entitled to
 *   limited_external may additionally take pre-approved categories up to their
 *                    own spend limit; everything restricted still asks the owner
 */

export type ActionCategory =
  | "internal_work"
  | "knowledge_write"
  | "spend"
  | "external_communication"
  | "public_deploy"
  | "credential_use"
  | "data_export";

export interface ProposedAction {
  category: ActionCategory;
  tool?: string;
  summary: string;
  amountCents?: number;
  details?: Record<string, unknown>;
}

export interface PolicyOutcome {
  outcome: "allow" | "require_approval" | "deny";
  reason: string;
  category: ActionCategory;
}

/** Categories that always need the owner, whatever an employee's settings say. */
const ALWAYS_RESTRICTED: ActionCategory[] = [
  "external_communication",
  "public_deploy",
  "credential_use",
  "data_export",
];

export function evaluateAction(input: {
  company: Company;
  employee: Employee;
  config: AppConfig;
  action: ProposedAction;
  committedCents: number;
  policies?: Record<string, unknown>;
}): PolicyOutcome {
  const { company, employee, action } = input;
  const policies = input.policies ?? {};
  const category = action.category;

  // 1. Safety. These cannot be switched off by policy or by an employee.
  if (company.haltedAt) {
    return { outcome: "deny", reason: "Company emergency stop is active.", category };
  }
  if (employee.paused) {
    return { outcome: "deny", reason: "Employee is paused by the owner.", category };
  }
  if (employee.authority === "observe" && category !== "internal_work" ) {
    return { outcome: "deny", reason: "Observe-only employees may read and propose, not act.", category };
  }
  if (employee.authority === "observe" && action.tool && !action.tool.startsWith("files.read") && !action.tool.startsWith("knowledge.read")) {
    return { outcome: "deny", reason: "Observe-only employees cannot perform this action.", category };
  }
  if (action.tool && !employee.allowedTools.includes(action.tool)) {
    return { outcome: "deny", reason: `Tool ${action.tool} is not granted to ${employee.name}.`, category };
  }

  // 2. Restricted actions always need the owner. Nobody can approve their own.
  if (ALWAYS_RESTRICTED.includes(category)) {
    return {
      outcome: "require_approval",
      reason: `${category.replace(/_/g, " ")} requires owner approval.`,
      category,
    };
  }

  // 3. Money. Ledger cents are bookkeeping, not a charge: estimates and token
  // usage are virtual, so a balance never caps the team and an agent's own spend
  // limit never stops its work. Paying an external party is real money and stays
  // the owner's decision at any amount.
  const amount = Math.max(0, action.amountCents ?? 0);
  if (category === "spend") {
    return {
      outcome: "require_approval",
      reason: `Paying ${amount}¢ is real money and needs the owner, whatever the delegated limit.`,
      category,
    };
  }

  return { outcome: "allow", reason: "Inside the employee's authority.", category };
}

/** Owners authorise decisions; employees never can, including their own. */
export function canDecide(actor: { type: "human" | "employee"; id: string }, decision: { requestedByEmployeeId: string | null; companyId: string }): boolean {
  if (actor.type !== "human") return false;
  return true;
}

export function isMaterialChange(previous: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}
