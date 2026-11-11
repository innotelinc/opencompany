import { getCompany, getPolicies, recordActivity, setPolicy } from "@/lib/domain/repo";

/**
 * Standing approval — "remember that I already said yes".
 *
 * The owner can pre-approve a bounded class of decisions once, and the company
 * keeps applying that consent to every matching decision until it is revoked.
 * This is owner authority, not agent authority: an employee can never grant it,
 * raise its cap or widen its scope, and the record of who granted it, when and
 * for what stays in the policy table and the activity log.
 *
 * Safety floor: irreversible categories (credential use, data export) and
 * high-risk decisions are never handled by a standing approval, whatever the
 * grant says.
 */

export const STANDING_APPROVAL_KINDS = ["plan", "spend", "external_communication", "public_deploy"] as const;
export type StandingApprovalKind = (typeof STANDING_APPROVAL_KINDS)[number];

/** Categories the owner may not delegate to a standing approval. */
const NEVER_STANDING: string[] = ["credential_use", "data_export"];

export const STANDING_APPROVAL_POLICY = "autonomy.standing_approval";

export interface StandingApproval {
  granted: boolean;
  kinds: StandingApprovalKind[];
  maxCents: number;
  note: string | null;
  grantedBy: string | null;
  grantedAt: string | null;
}

const EMPTY: StandingApproval = {
  granted: false,
  kinds: [],
  maxCents: 0,
  note: null,
  grantedBy: null,
  grantedAt: null,
};

export function getStandingApproval(companyId: string): StandingApproval {
  const raw = getPolicies(companyId)[STANDING_APPROVAL_POLICY];
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const record = raw as Record<string, unknown>;
  const kinds = Array.isArray(record.kinds)
    ? record.kinds.filter((kind): kind is StandingApprovalKind =>
        STANDING_APPROVAL_KINDS.includes(kind as StandingApprovalKind),
      )
    : [];
  return {
    granted: record.granted === true && kinds.length > 0,
    kinds,
    maxCents: Math.max(0, Math.round(Number(record.maxCents ?? 0))),
    note: typeof record.note === "string" && record.note.trim() ? record.note : null,
    grantedBy: typeof record.grantedBy === "string" ? record.grantedBy : null,
    grantedAt: typeof record.grantedAt === "string" ? record.grantedAt : null,
  };
}

export function grantStandingApproval(input: {
  companyId: string;
  ownerId: string;
  kinds: string[];
  maxCents: number;
  note?: string;
}): { ok: boolean; approval: StandingApproval; reason?: string } {
  const kinds = [...new Set(input.kinds)].filter((kind): kind is StandingApprovalKind =>
    STANDING_APPROVAL_KINDS.includes(kind as StandingApprovalKind),
  );
  if (kinds.length === 0) {
    return {
      ok: false,
      approval: getStandingApproval(input.companyId),
      reason: "Choose at least one kind of decision the owner is pre-approving.",
    };
  }
  const maxCents = Math.round(Number(input.maxCents));
  if (!Number.isFinite(maxCents) || maxCents < 0) {
    return { ok: false, approval: getStandingApproval(input.companyId), reason: "The spend cap must be zero or more." };
  }

  const approval: StandingApproval = {
    granted: true,
    kinds,
    maxCents,
    note: input.note?.trim() ? input.note.trim() : null,
    grantedBy: input.ownerId,
    grantedAt: new Date().toISOString(),
  };
  setPolicy(
    input.companyId,
    STANDING_APPROVAL_POLICY,
    approval,
    "Owner standing approval: agents may decide these kinds automatically inside the cap.",
  );
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "autonomy.granted",
    summary: `Owner granted standing approval for ${kinds.join(", ")} up to ${maxCents}¢.`,
    payload: { ...approval },
  });
  return { ok: true, approval };
}

export function revokeStandingApproval(input: {
  companyId: string;
  ownerId: string;
}): { ok: boolean; approval: StandingApproval } {
  const previous = getStandingApproval(input.companyId);
  const approval: StandingApproval = {
    granted: false,
    kinds: [],
    maxCents: 0,
    note: null,
    grantedBy: input.ownerId,
    grantedAt: new Date().toISOString(),
  };
  setPolicy(
    input.companyId,
    STANDING_APPROVAL_POLICY,
    approval,
    "Owner standing approval: revoked. Every decision waits at the desk again.",
  );
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "autonomy.revoked",
    summary: previous.granted
      ? `Owner revoked the standing approval (was ${previous.kinds.join(", ")} up to ${previous.maxCents}¢).`
      : "Owner revoked the standing approval.",
    payload: { previous, next: approval },
  });
  return { ok: true, approval };
}

/**
 * Does the owner's remembered consent cover this decision? Pure read: callers
 * record the outcome, so the same answer is auditable after the fact.
 */
export function matchesStandingApproval(input: {
  companyId: string;
  kind: string;
  risk: string;
  action: Record<string, unknown>;
}): { allowed: boolean; reason: string; approval: StandingApproval } {
  const approval = getStandingApproval(input.companyId);
  const company = getCompany(input.companyId);

  if (!approval.granted) {
    return { allowed: false, reason: "No standing approval is in force.", approval };
  }
  if (company?.haltedAt) {
    return { allowed: false, reason: "The emergency stop is active; nothing is decided automatically.", approval };
  }
  if (NEVER_STANDING.includes(input.kind)) {
    return { allowed: false, reason: `${input.kind.replace(/_/g, " ")} can never be granted in advance.`, approval };
  }
  if (!approval.kinds.includes(input.kind as StandingApprovalKind)) {
    return { allowed: false, reason: `${input.kind.replace(/_/g, " ")} is outside the standing approval.`, approval };
  }
  if (input.risk === "high") {
    return { allowed: false, reason: "High-risk decisions always go to the owner.", approval };
  }
  const amount = Math.max(0, Number(input.action.amountCents ?? input.action.budgetCents ?? 0));
  if (!Number.isFinite(amount)) {
    return { allowed: false, reason: "The proposed cost could not be read, so it needs the owner.", approval };
  }
  if (amount > approval.maxCents) {
    return {
      allowed: false,
      reason: `${amount}¢ exceeds the ${approval.maxCents}¢ standing approval.`,
      approval,
    };
  }
  return {
    allowed: true,
    reason: `Inside the owner's standing approval: ${input.kind.replace(/_/g, " ")} up to ${approval.maxCents}¢.`,
    approval,
  };
}
