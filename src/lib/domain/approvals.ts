import crypto from "node:crypto";
import { getDb, newId, nowIso, sha256 } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { getDecision, getOwner, listDecisions, recordActivity } from "@/lib/domain/repo";
import { sendMail, smtpConfigured } from "@/lib/mail";
import type { Decision } from "@/lib/domain/types";

/**
 * Reaching the owner when a decision is waiting.
 *
 * The console is the first channel: a decision that appears while the owner is
 * looking at the site raises a popup, and the page's own heartbeat records that
 * they are there. When nobody is there, the worker sends one email carrying a
 * single-use link. The link opens a page that states what is being approved and
 * completes it with a POST, so a mail scanner that fetches every URL in a message
 * cannot approve anything by itself.
 */

export interface ApprovalLink {
  id: string;
  companyId: string;
  decisionId: string;
  humanMemberId: string;
  expiresAt: string;
  usedAt: string | null;
  emailedAt: string | null;
}

interface LinkRow {
  id: string;
  company_id: string;
  decision_id: string;
  human_member_id: string;
  expires_at: string;
  used_at: string | null;
  emailed_at: string | null;
}

function mapLink(row: LinkRow): ApprovalLink {
  return {
    id: row.id,
    companyId: row.company_id,
    decisionId: row.decision_id,
    humanMemberId: row.human_member_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    emailedAt: row.emailed_at,
  };
}

/** The secret is deployment-wide; without it links are not minted at all. */
function approvalSecret(): string {
  return (
    process.env.OPENCOMPANY_APPROVAL_SECRET?.trim() ||
    process.env.OPENCO_APPROVAL_SECRET?.trim() ||
    getConfig().approvals.secret
  );
}

export function approvalLinksEnabled(): boolean {
  return approvalSecret().length >= 16;
}

function hashToken(token: string): string {
  const secret = approvalSecret();
  if (secret.length < 16) throw new Error("OPENCOMPANY_APPROVAL_SECRET must be at least 16 characters.");
  return sha256(`${secret}:${token}`);
}

function baseUrl(): string {
  return getConfig().approvals.baseUrl.replace(/\/+$/, "");
}

export function approvalUrl(token: string): string {
  return `${baseUrl()}/approvals/${encodeURIComponent(token)}`;
}

/** Mint a link for one decision. The raw token is returned once and never stored. */
export function createApprovalLink(input: {
  companyId: string;
  decisionId: string;
  humanMemberId: string;
  ttlHours?: number;
}): { token: string; url: string; link: ApprovalLink } | null {
  if (!approvalLinksEnabled()) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const id = newId("apl");
  const created = nowIso();
  const ttl = input.ttlHours ?? getConfig().approvals.linkTtlHours;
  const expires = new Date(Date.parse(created) + ttl * 3600_000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO approval_links (id, company_id, decision_id, human_member_id, token_hash, created_at, expires_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(id, input.companyId, input.decisionId, input.humanMemberId, hashToken(token), created, expires);
  const row = getDb().prepare("SELECT * FROM approval_links WHERE id = ?").get(id) as LinkRow;
  return { token, url: approvalUrl(token), link: mapLink(row) };
}

/** The link a token names, whether or not it is still usable. */
export function approvalLinkByToken(token: string): ApprovalLink | null {
  if (!approvalLinksEnabled() || !token) return null;
  let hash: string;
  try {
    hash = hashToken(token);
  } catch {
    return null;
  }
  const row = getDb().prepare("SELECT * FROM approval_links WHERE token_hash = ?").get(hash) as LinkRow | undefined;
  return row ? mapLink(row) : null;
}

/** Spend the link. Exactly one caller succeeds, even when two clicks race. */
export function consumeApprovalLink(token: string): ApprovalLink | null {
  const link = approvalLinkByToken(token);
  if (!link || link.usedAt || Date.parse(link.expiresAt) <= Date.now()) return null;
  const result = getDb()
    .prepare("UPDATE approval_links SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
    .run(nowIso(), link.id, nowIso());
  if (result.changes !== 1) return null;
  return approvalLinkByToken(token);
}

export function markLinkEmailed(linkId: string): void {
  getDb().prepare("UPDATE approval_links SET emailed_at = ? WHERE id = ? AND emailed_at IS NULL").run(nowIso(), linkId);
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export function recordOwnerPresence(companyId: string, humanMemberId: string): void {
  getDb()
    .prepare(
      `INSERT INTO owner_presence (company_id, human_member_id, last_seen_at) VALUES (?,?,?)
       ON CONFLICT(company_id, human_member_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    )
    .run(companyId, humanMemberId, nowIso());
}

/** Seconds since the owner was last seen, or null if they never were. */
export function ownerAwaySeconds(companyId: string, humanMemberId: string): number | null {
  const row = getDb()
    .prepare("SELECT last_seen_at FROM owner_presence WHERE company_id = ? AND human_member_id = ?")
    .get(companyId, humanMemberId) as { last_seen_at: string } | undefined;
  if (!row) return null;
  return Math.max(0, Math.round((Date.now() - Date.parse(row.last_seen_at)) / 1000));
}

/** True when the owner was seen after the decision was created. */
export function ownerSawDecision(companyId: string, humanMemberId: string, decision: Decision): boolean {
  const row = getDb()
    .prepare("SELECT last_seen_at FROM owner_presence WHERE company_id = ? AND human_member_id = ?")
    .get(companyId, humanMemberId) as { last_seen_at: string } | undefined;
  if (!row) return false;
  return Date.parse(row.last_seen_at) >= Date.parse(decision.createdAt);
}

// ---------------------------------------------------------------------------
// What the console shows and what the worker sends
// ---------------------------------------------------------------------------

export interface PendingApprovalView {
  id: string;
  title: string;
  kind: string;
  risk: string;
  businessReason: string;
  createdAt: string;
  actionHash: string;
  action: Record<string, unknown>;
}

export function pendingApprovalViews(companyId: string): PendingApprovalView[] {
  return listDecisions(companyId, "pending").map((decision) => ({
    id: decision.id,
    title: decision.title,
    kind: decision.kind,
    risk: decision.risk,
    businessReason: decision.businessReason,
    createdAt: decision.createdAt,
    actionHash: decision.actionHash,
    action: decision.action,
  }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The message the owner receives. Exported so a test can read it without a network. */
export function buildApprovalEmail(decision: Decision, url: string): { subject: string; text: string; html: string } {
  const action = JSON.stringify(decision.action, null, 2);
  const subject = `Waiting on you: ${decision.title}`;
  const text = [
    `${decision.title}`,
    "",
    decision.businessReason,
    "",
    `Kind: ${decision.kind.replace(/_/g, " ")} · risk: ${decision.risk}`,
    "",
    "The exact action:",
    action.length > 4000 ? `${action.slice(0, 4000)}\n… truncated` : action,
    "",
    `Approve: ${url}`,
    "",
    "The link opens a page that shows this decision again and approves it with one",
    "button press. It works once and expires on its own. If you would rather not",
    "approve, ignore this message: nothing runs without you.",
  ].join("\n");

  const html = [
    "<div style=\"font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1f1b;max-width:560px\">",
    `<p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b6f66;margin:0 0 6px">OPENco. · approval needed</p>`,
    `<h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(decision.title)}</h1>`,
    `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(decision.businessReason)}</p>`,
    `<p style="font-size:13px;color:#6b6f66;margin:0 0 16px">${escapeHtml(decision.kind.replace(/_/g, " "))} · risk ${escapeHtml(decision.risk)}</p>`,
    `<pre style="font-size:12px;background:#f4f5f1;border:1px solid #e2e4dc;border-radius:8px;padding:12px;white-space:pre-wrap;max-height:320px;overflow:auto">${escapeHtml(action.length > 4000 ? `${action.slice(0, 4000)}\n… truncated` : action)}</pre>`,
    `<p style="margin:18px 0"><a href="${escapeHtml(url)}" style="background:#1f3d34;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;display:inline-block;font-weight:600">Review and approve</a></p>`,
    `<p style="font-size:12px;color:#6b6f66;line-height:1.5;margin:0">The link works once and expires on its own. Nothing runs until you press approve on that page.</p>`,
    "</div>",
  ].join("");

  return { subject, text, html };
}

export interface EscalationResult {
  sent: number;
  skipped: number;
  reason?: string;
}

/**
 * Email every decision that has waited longer than the grace period while the
 * owner was away. One message per decision: a second tick must not send again.
 */
export async function escalatePendingApprovals(companyId: string): Promise<EscalationResult> {
  if (!smtpConfigured() || !approvalLinksEnabled()) {
    return { sent: 0, skipped: 0, reason: "Approval email is not configured." };
  }
  // The owner is the company's first human member, the same row the console signs
  // in as — not whoever happens to carry a role string.
  const owner = getOwner(companyId);

  const afterSeconds = getConfig().approvals.emailAfterSeconds;
  const pending = listDecisions(companyId, "pending").filter(
    (decision) => (Date.now() - Date.parse(decision.createdAt)) / 1000 >= afterSeconds,
  );
  if (pending.length === 0) return { sent: 0, skipped: 0 };

  if (ownerSawDecision(companyId, owner.id, pending[0])) {
    return { sent: 0, skipped: pending.length, reason: "The owner is at the console." };
  }

  let sent = 0;
  let skipped = 0;
  for (const decision of pending) {
    const already = getDb()
      .prepare("SELECT id FROM approval_links WHERE decision_id = ? AND emailed_at IS NOT NULL LIMIT 1")
      .get(decision.id) as { id: string } | undefined;
    if (already) {
      skipped += 1;
      continue;
    }
    // A failed send must not mint a new token on every tick: retry an unemailed
    // attempt only after the backoff, so a relay outage does not accumulate links.
    const recent = getDb()
      .prepare(
        "SELECT created_at FROM approval_links WHERE decision_id = ? AND emailed_at IS NULL ORDER BY created_at DESC LIMIT 1",
      )
      .get(decision.id) as { created_at: string } | undefined;
    if (recent && Date.now() - Date.parse(recent.created_at) < 10 * 60_000) {
      skipped += 1;
      continue;
    }
    const minted = createApprovalLink({ companyId, decisionId: decision.id, humanMemberId: owner.id });
    if (!minted) return { sent, skipped, reason: "Approval links need OPENCOMPANY_APPROVAL_SECRET." };

    const message = buildApprovalEmail(decision, minted.url);
    const result = await sendMail({ to: owner.email, ...message });
    if (!result.ok) {
      skipped += 1;
      console.error(`[approvals] could not email decision ${decision.id}: ${result.reason}`);
      continue;
    }
    markLinkEmailed(minted.link.id);
    recordActivity({
      companyId,
      actorType: "system",
      type: "decision.emailed",
      summary: `Sent ${owner.email} the approval link for: ${decision.title}`,
      taskId: decision.taskId,
      projectId: decision.projectId,
      payload: { decisionId: decision.id },
    });
    sent += 1;
  }
  return { sent, skipped };
}

/** Where a click lands: the decision the token names, if it is still waiting. */
export function decisionForLink(link: ApprovalLink): Decision | null {
  return getDecision(link.companyId, link.decisionId);
}
