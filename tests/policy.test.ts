import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import { getConfig } from "../src/lib/config";
import { actionHash } from "../src/lib/db";
import { addLedgerEntry, getExternalAction, listDecisions, listExternalActions, listEmployees } from "../src/lib/domain/repo";
import { proposeDecision, approveDecision, rejectDecision } from "../src/lib/domain/decisions";
import { canDispatch } from "../src/lib/domain/budget";
import { evaluateAction } from "../src/lib/policy";
import { executeExternalAction } from "../src/lib/engine/external";
import { closeDb, getDb } from "../src/lib/db";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

const companyId = seedCompany();
const employees = listEmployees(companyId);
const developer = employees.find((employee) => /Web Developer/.test(employee.title))!;
const researcher = employees.find((employee) => /Researcher/.test(employee.title))!;
const company = { ...getConfig(), limits: getConfig().limits } as any;
import { getCompanyBySlug } from "../src/lib/domain/repo";
const companyRow = getCompanyBySlug("test-studio")!;

test.after(() => {
  closeDb();
  cleanup();
});

test("authority is enforced: unlisted tools and observe-only employees are denied", () => {
  const config = getConfig();
  const base = {
    company: companyRow,
    employee: developer,
    config,
    committedCents: 0,
    action: { category: "internal_work" as const, tool: "terminal.exec", summary: "run tests" },
  };
  assert.equal(evaluateAction(base).outcome, "allow");

  const unlisted = evaluateAction({
    ...base,
    action: { category: "internal_work", tool: "browser.session", summary: "browse" },
  });
  assert.equal(unlisted.outcome, "deny");

  const observer = evaluateAction({
    ...base,
    employee: { ...researcher, authority: "observe", allowedTools: ["files.read"] },
    action: { category: "internal_work", tool: "files.write", summary: "write" },
  });
  assert.equal(observer.outcome, "deny");
  assert.match(observer.reason, /Observe-only|cannot perform/);
  void company;
});

test("restricted actions always ask the owner", () => {
  const config = getConfig();
  for (const category of ["public_deploy", "external_communication", "credential_use"] as const) {
    const outcome = evaluateAction({
      company: companyRow,
      employee: { ...developer, authority: "limited_external" },
      config,
      committedCents: 0,
      action: { category, summary: "restricted" },
    });
    assert.equal(outcome.outcome, "require_approval", category);
  }
});

test("real spending needs the owner; virtual budget never blocks", () => {
  const config = getConfig();
  const overLimit = evaluateAction({
    company: companyRow,
    employee: { ...developer, spendLimitCents: 10 },
    config,
    committedCents: 0,
    action: { category: "spend", summary: "buy", amountCents: 50 },
  });
  assert.equal(overLimit.outcome, "require_approval", "paying money is the owner's call at any limit");
  assert.match(overLimit.reason, /real money/);

  // Ledger cents are bookkeeping, not a charge: crossing the figure warns and work continues.
  const overrun = canDispatch(companyId, 10, { "budget.monthly_limit_cents": 5 });
  assert.equal(overrun.ok, true);
  assert.match(overrun.warning ?? "", /Virtual budget/);

  // The owner may remove the ceiling entirely; metering continues, overruns stop.
  const uncapped = canDispatch(companyId, 10, { "budget.monthly_limit_cents": 0 });
  assert.equal(uncapped.ok, true);
  assert.equal(uncapped.snapshot.unlimited, true);
  assert.equal(uncapped.warning, undefined, "a removed ceiling must never report an overrun");
});

test("an owner decision binds to the exact action and changes invalidate it", () => {
  const decision = proposeDecision({
    companyId,
    requestedByEmployeeId: developer.id,
    taskId: null,
    projectId: null,
    kind: "public_deploy",
    title: "Publish to customer.example.test",
    businessReason: "Test",
    action: {
      kind: "public_deploy",
      externalKind: "deployment_package",
      target: "customer.example.test",
      deliverableId: "dlv_test",
      manifest: [{ path: "index.html", sha256: "abc" }],
    },
    risk: "high",
  });

  const tampered = approveDecision({
    companyId,
    decisionId: decision.id,
    actor: { type: "human", id: "owner" },
    submittedAction: { ...decision.action, target: "somewhere-else.example.test" },
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.decision.status, "invalidated");
  assert.match(tampered.reason ?? "", /changed/i);
  assert.equal(listExternalActions(companyId).filter((action) => action.decisionId === decision.id).length, 0);
});

test("employees cannot approve anything, including their own requests", () => {
  const decision = proposeDecision({
    companyId,
    requestedByEmployeeId: developer.id,
    taskId: null,
    projectId: null,
    kind: "spend",
    title: "Buy a font licence",
    businessReason: "Test",
    action: { kind: "spend", target: "font-provider" },
  });
  const result = approveDecision({
    companyId,
    decisionId: decision.id,
    actor: { type: "employee", id: developer.id },
  });
  assert.equal(result.ok, false);
  assert.equal(listDecisions(companyId).find((item) => item.id === decision.id)!.status, "pending");
  const rejected = rejectDecision({ companyId, decisionId: decision.id, actor: { type: "human", id: "owner" } });
  assert.equal(rejected.ok, true);
});

test("an approved external action is blocked when its details were altered after approval", async () => {
  const decision = proposeDecision({
    companyId,
    requestedByEmployeeId: developer.id,
    taskId: null,
    projectId: null,
    kind: "public_deploy",
    title: "Publish tampered deliverable",
    businessReason: "Test",
    action: {
      kind: "public_deploy",
      externalKind: "deployment_package",
      target: "tampered.example.test",
      deliverableId: "dlv_missing",
    },
    risk: "high",
  });
  const approved = approveDecision({ companyId, decisionId: decision.id, actor: { type: "human", id: "owner" } });
  assert.equal(approved.ok, true);

  const created = listExternalActions(companyId).find((action) => action.decisionId === decision.id)!;
  assert.ok(created);
  getDb()
    .prepare("UPDATE external_actions SET action_hash = ? WHERE id = ?")
    .run(actionHash({ target: "different" }), created.id);

  const outcome = await executeExternalAction(companyId, created.id, "test-worker");
  assert.equal(outcome?.status, "blocked");
  const stored = getExternalAction(companyId, created.id)!;
  assert.equal(stored.status, "blocked");
  assert.equal(listDecisions(companyId).find((item) => item.id === decision.id)!.status, "invalidated");
});

test("ledger entries can be recorded without inventing provider charges", () => {
  const entry = addLedgerEntry({
    companyId,
    kind: "recorded",
    category: "other",
    amountCents: 0,
    description: "Tokens recorded; pricing not configured.",
  });
  assert.equal(entry.amountCents, 0);
});
