import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";

// The secret makes a token unforgeable, and the base URL is what the owner clicks.
process.env.OPENCOMPANY_APPROVAL_SECRET = "test-approval-secret-0123456789";
process.env.OPENCOMPANY_BASE_URL = "https://console.example.test";
process.env.OPENCOMPANY_APPROVAL_EMAIL_AFTER_SECONDS = "0";
// Port 1 refuses the connection immediately, so the escalation test exercises the
// send path without leaving the machine.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "1";
process.env.SMTP_FROM = "openco@test-studio.test";

import { closeDb, getDb } from "../src/lib/db";
import { seedCompany } from "../scripts/seed";
import { getOwner } from "../src/lib/domain/repo";
import { proposeDecision } from "../src/lib/domain/decisions";
import {
  approvalLinkByToken,
  approvalLinksEnabled,
  buildApprovalEmail,
  consumeApprovalLink,
  createApprovalLink,
  escalatePendingApprovals,
  ownerAwaySeconds,
  ownerSawDecision,
  pendingApprovalViews,
  recordOwnerPresence,
} from "../src/lib/domain/approvals";
import { buildMime, smtpSettings } from "../src/lib/mail";
import { cleanup } from "./helpers";

const companyId = seedCompany();
const owner = getOwner(companyId)!;

function spend(title = "Pay the invoice") {
  return proposeDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "spend",
    title,
    businessReason: "The invoice is due.",
    action: { kind: "spend", amountCents: 1200, target: "supplier" },
    risk: "medium",
  });
}

test.after(() => {
  closeDb();
  cleanup();
});

test("a link is minted once, hashed at rest, and resolves to its decision", () => {
  assert.equal(approvalLinksEnabled(), true);
  const decision = spend();
  const minted = createApprovalLink({ companyId, decisionId: decision.id, humanMemberId: owner.id });
  assert.ok(minted, "a secret is set, so a link can exist");
  assert.match(minted.url, /^https:\/\/console\.example\.test\/approvals\//);

  const stored = getDb().prepare("SELECT token_hash FROM approval_links WHERE id = ?").get(minted.link.id) as {
    token_hash: string;
  };
  assert.ok(!stored.token_hash.includes(minted.token), "the token itself is never stored");

  const found = approvalLinkByToken(minted.token);
  assert.equal(found?.decisionId, decision.id);
  assert.equal(approvalLinkByToken(`${minted.token}x`), null, "a tampered token resolves to nothing");
});

test("one link approves once, and a second press changes nothing", () => {
  const decision = spend("Publish the report");
  const minted = createApprovalLink({ companyId, decisionId: decision.id, humanMemberId: owner.id })!;

  const first = consumeApprovalLink(minted.token);
  assert.equal(first?.decisionId, decision.id);
  assert.equal(consumeApprovalLink(minted.token), null, "the link is spent");
  assert.ok(approvalLinkByToken(minted.token)?.usedAt, "and the row records when");
});

test("the email carries the action, the link and a warning that it is single use", () => {
  const decision = spend("Send the client a quote");
  const { subject, text, html } = buildApprovalEmail(decision, "https://console.example.test/approvals/abc");
  assert.match(subject, /Send the client a quote/);
  assert.match(text, /https:\/\/console\.example\.test\/approvals\/abc/);
  assert.match(text, /works once/);
  assert.match(text, /amountCents/);
  assert.match(html, /Review and approve/);
});

test("the MIME message is well formed and dot-stuffed", () => {
  const settings = smtpSettings()!;
  const mime = buildMime({ to: owner.email, subject: "A subject", text: ".leading dot" }, settings);
  assert.match(mime, /^From: /);
  assert.match(mime, /Subject: A subject/);
  assert.match(mime, /\r\n\.\.leading dot$/, "a body line starting with a dot is escaped");
});

test("presence decides whether the owner already saw the decision", () => {
  const decision = spend("Approve the budget");
  recordOwnerPresence(companyId, owner.id);
  assert.equal(ownerSawDecision(companyId, owner.id, decision), true);
  assert.equal(typeof ownerAwaySeconds(companyId, owner.id), "number");

  const later = spend("A decision after the last visit");
  getDb()
    .prepare("UPDATE owner_presence SET last_seen_at = ? WHERE company_id = ? AND human_member_id = ?")
    .run("2020-01-01T00:00:00.000Z", companyId, owner.id);
  assert.equal(ownerSawDecision(companyId, owner.id, later), false);
});

test("an owner at the console is not emailed", async () => {
  recordOwnerPresence(companyId, owner.id);
  const result = await escalatePendingApprovals(companyId);
  assert.equal(result.sent, 0);
  assert.match(result.reason ?? "", /console/);
});

test("an absent owner is emailed, and a failed relay is recorded rather than repeated", async () => {
  spend("Approve the supplier payment");
  getDb()
    .prepare("UPDATE owner_presence SET last_seen_at = ? WHERE company_id = ? AND human_member_id = ?")
    .run("2020-01-01T00:00:00.000Z", companyId, owner.id);

  const first = await escalatePendingApprovals(companyId);
  assert.equal(first.sent, 0, "the test relay refuses, so nothing is sent");
  assert.ok(first.skipped > 0);

  const again = await escalatePendingApprovals(companyId);
  assert.equal(again.sent, 0);
  assert.ok(
    (getDb().prepare("SELECT COUNT(*) AS n FROM approval_links WHERE company_id = ?").get(companyId) as { n: number }).n >= 1,
    "the attempt left a link for the next try",
  );
});

test("the popup reads what is waiting", () => {
  const decision = spend("A decision the popup must show");
  const pending = pendingApprovalViews(companyId);
  assert.ok(pending.some((item) => item.id === decision.id));
  assert.ok(pending.every((item) => item.action && item.actionHash));
});
