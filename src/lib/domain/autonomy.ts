import { getCompany, getPolicies, recordActivity, setPolicy } from "@/lib/domain/repo";

/**
 * Standing approval — "remember that I already said yes".
 *
 * The owner pre-approves a class of decision once and the company keeps applying
 * that consent until it is revoked. There is no financial ceiling: the grant is
 * unlimited inside the kinds the owner chose. This is owner authority, not agent
 * authority — an employee can never grant it or widen its scope, and the record
 * of who granted it, when and for what stays in the policy table and the log.
 *
 * The one safety floor: irreversible categories (credential use, data export)
 * are never handled by a standing approval.
 */

export const STANDING_APPROVAL_KINDS = ["plan", "spend", "external_communication", "public_deploy"] as const;
export type StandingApprovalKind = (typeof STANDING_APPROVAL_KINDS)[number];

/** Word boundaries matter: "unpublished" is publish, "respending" is not spend. */
function wordsOf(key: string): Set<string> {
  return new Set(key.split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * Categories the owner may not delegate to a standing approval, in any wording.
 * Checked before the catalogue kinds so "approval to use the client's
 * credentials to deploy" can never be read as a deployment.
 */
const NEVER_STANDING_WORDS: Record<string, string[]> = {
  credential_use: ["credential", "credentials", "secret", "secrets", "api_key", "token", "tokens", "password", "passwords"],
  data_export: ["export", "exports", "exporting", "exfiltration", "bulk_download"],
};

export function neverStandingKind(kind: string): string | null {
  const words = wordsOf(normalizeKind(kind));
  for (const [name, list] of Object.entries(NEVER_STANDING_WORDS)) {
    if (list.some((word) => words.has(word))) return name;
  }
  return null;
}

/** Lower-case and unify separators so "Public Deploy" and "public-deploy" agree. */
function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Employees word the same category differently depending on the model: one
 * proposes "publish", the next "public_deploy", a third "plan_approval". The
 * owner granted a category, not a spelling, so every wording a live agent has
 * produced maps onto the catalogue before coverage is judged. The decision
 * keeps the wording the employee used, for the audit trail.
 */
const KIND_ALIASES: Record<string, StandingApprovalKind> = {
  plan: "plan",
  plan_approval: "plan",
  approve_plan: "plan",
  project_plan: "plan",
  budget: "plan",
  budget_approval: "plan",
  public_deploy: "public_deploy",
  deploy: "public_deploy",
  deployment: "public_deploy",
  publish: "public_deploy",
  publishing: "public_deploy",
  publish_site: "public_deploy",
  site_publish: "public_deploy",
  spend: "spend",
  spending: "spend",
  purchase: "spend",
  payment: "spend",
  external_communication: "external_communication",
  external_message: "external_communication",
  external_email: "external_communication",
  email: "external_communication",
  outreach: "external_communication",
};

/** Which catalogue kind a decision belongs to, or null when it is not delegable. */
/** The words agents actually use for each catalogue kind. */
const KIND_WORDS: { kind: StandingApprovalKind; words: string[] }[] = [
  { kind: "plan", words: ["plan", "plans", "planning", "planned", "budget", "budgets", "roadmap", "blueprint"] },
  {
    kind: "public_deploy",
    words: [
      "deploy",
      "deploys",
      "deployment",
      "deployments",
      "deploying",
      "publish",
      "publishes",
      "publishing",
      "published",
      "redeploy",
      "site_publish",
      "go_live",
      "golive",
    ],
  },
  {
    kind: "spend",
    words: [
      "spend",
      "spending",
      "purchase",
      "purchases",
      "purchasing",
      "buy",
      "buying",
      "payment",
      "payments",
      "pay",
      "invoice",
      "invoices",
      "expense",
      "expenses",
      "refund",
    ],
  },
  {
    kind: "external_communication",
    words: [
      "email",
      "emails",
      "message",
      "messages",
      "messaging",
      "outreach",
      "newsletter",
      "newsletters",
      "communication",
      "communications",
      "communicate",
      "send",
      "sending",
      "contact",
      "campaign",
      "announce",
      "announcement",
    ],
  },
];

export function canonicalDecisionKind(kind: string): StandingApprovalKind | null {
  const key = normalizeKind(kind);
  const direct = KIND_ALIASES[key];
  if (direct) return direct;
  // Irreversible categories stay out of the catalogue whatever else they mention.
  if (neverStandingKind(kind)) return null;
  const words = wordsOf(key);
  for (const entry of KIND_WORDS) {
    if (entry.words.some((word) => words.has(word))) return entry.kind;
  }
  // Compact forms the word list cannot see: "site-deployment", "webpublishing".
  if (key.startsWith("plan") || key.includes("deploy") || key.includes("publish")) {
    return key.includes("deploy") || key.includes("publish") ? "public_deploy" : "plan";
  }
  if (key.includes("spend") || key.includes("purchase") || key.includes("payment")) return "spend";
  if (key.startsWith("external") || key.includes("message") || key.includes("email")) {
    return "external_communication";
  }
  return null;
}

export const STANDING_APPROVAL_POLICY = "autonomy.standing_approval";

export interface StandingApproval {
  granted: boolean;
  kinds: StandingApprovalKind[];
  note: string | null;
  grantedBy: string | null;
  grantedAt: string | null;
}

const EMPTY: StandingApproval = {
  granted: false,
  kinds: [],
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
    note: typeof record.note === "string" && record.note.trim() ? record.note : null,
    grantedBy: typeof record.grantedBy === "string" ? record.grantedBy : null,
    grantedAt: typeof record.grantedAt === "string" ? record.grantedAt : null,
  };
}

export function grantStandingApproval(input: {
  companyId: string;
  ownerId: string;
  kinds: string[];
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

  const approval: StandingApproval = {
    granted: true,
    kinds,
    note: input.note?.trim() ? input.note.trim() : null,
    grantedBy: input.ownerId,
    grantedAt: new Date().toISOString(),
  };
  setPolicy(
    input.companyId,
    STANDING_APPROVAL_POLICY,
    approval,
    "Owner standing approval: agents may decide these kinds automatically, with no ceiling.",
  );
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "autonomy.granted",
    summary: `Owner granted unlimited standing approval for ${kinds.join(", ")}.`,
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
      ? `Owner revoked the standing approval (was ${previous.kinds.join(", ")}).`
      : "Owner revoked the standing approval.",
    payload: { previous, next: approval },
  });
  return { ok: true, approval };
}

/**
 * Does the owner's remembered consent cover this decision? Pure read: callers
 * record the outcome, so the same answer is auditable after the fact. No amount
 * is consulted — the grant is unlimited within its kinds.
 */
export function matchesStandingApproval(input: {
  companyId: string;
  kind: string;
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
  const normalized = normalizeKind(input.kind);
  const forbidden = neverStandingKind(input.kind);
  if (forbidden) {
    return { allowed: false, reason: `${forbidden.replace(/_/g, " ")} can never be granted in advance.`, approval };
  }
  const canonical = canonicalDecisionKind(input.kind);
  if (!canonical) {
    return {
      allowed: false,
      reason: `${normalized.replace(/_/g, " ")} is not a kind the standing approval can cover.`,
      approval,
    };
  }
  if (!approval.kinds.includes(canonical)) {
    return { allowed: false, reason: `${normalized.replace(/_/g, " ")} is outside the standing approval.`, approval };
  }
  return {
    allowed: true,
    reason: `Inside the owner's unlimited standing approval for ${canonical.replace(/_/g, " ")}.`,
    approval,
  };
}
