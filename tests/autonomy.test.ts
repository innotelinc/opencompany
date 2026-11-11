import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import { closeDb } from "../src/lib/db";
import { seedCompany } from "../scripts/seed";
import { getOwner, listDecisions } from "../src/lib/domain/repo";
import { proposeDecision } from "../src/lib/domain/decisions";
import { getStandingApproval, grantStandingApproval, revokeStandingApproval } from "../src/lib/domain/autonomy";
import { cleanup } from "./helpers";

/**
 * Standing approval is remembered owner consent: granted once, applied to every
 * matching decision until revoked, and never widened by the company itself.
 */
const companyId = seedCompany();
const owner = getOwner(companyId)!;

function plan(budgetCents: number, risk = "low") {
  return proposeDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "plan",
    title: `Plan for ${budgetCents}¢`,
    businessReason: "Test plan.",
    action: { kind: "plan", budgetCents },
    risk,
  });
}

test.after(() => {
  closeDb();
  cleanup();
});

test("nothing is approved automatically until the owner grants it", () => {
  assert.equal(getStandingApproval(companyId).granted, false);
  assert.equal(plan(40).status, "pending");
});

test("a granted standing approval is remembered and resolves matching decisions", () => {
  const granted = grantStandingApproval({ companyId, ownerId: owner.id, kinds: ["plan"] });
  assert.equal(granted.ok, true);
  assert.deepEqual(getStandingApproval(companyId).kinds, ["plan"]);
  assert.equal(getStandingApproval(companyId).grantedBy, owner.id);

  const approved = plan(40);
  assert.equal(approved.status, "auto_approved");
  assert.equal(approved.decidedBy, owner.id);
  assert.match(approved.resolutionNote ?? "", /Standing approval/);
  assert.ok(listDecisions(companyId).some((decision) => decision.id === approved.id));
});

test("the grant has no ceiling: every amount of a granted kind is approved", () => {
  assert.equal(plan(250).status, "auto_approved", "no amount limit inside the grant");
  assert.equal(plan(9_000, "high").status, "auto_approved", "no risk limit inside the grant");

  const deploy = proposeDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "public_deploy",
    title: "Publish the site",
    businessReason: "Test deploy.",
    action: { kind: "public_deploy", target: "example.test" },
    risk: "medium",
  });
  assert.equal(deploy.status, "pending", "kinds the owner did not grant still wait");
});

test("agent wordings for a granted kind still match the standing approval", () => {
  grantStandingApproval({ companyId, ownerId: owner.id, kinds: ["plan", "public_deploy"] });

  const publish = proposeDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "publish",
    title: "Publish the site",
    businessReason: "Ship the reviewed site.",
    action: { target: "example.test" },
  });
  assert.equal(publish.status, "auto_approved", "an agent that says publish means public_deploy");

  const planAlias = proposeDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "plan_approval",
    title: "Approve the plan",
    businessReason: "Release the plan.",
    action: { taskIds: [] },
  });
  assert.equal(planAlias.status, "auto_approved", "plan_approval is the plan kind");

  const credential = proposeDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "credential_use",
    title: "Use the client's credentials",
    businessReason: "Sign in as the client.",
    action: { provider: "client" },
  });
  assert.equal(credential.status, "pending", "credential use never rides on a standing approval");
});

test("multi-word agent phrasings land on the granted kind", () => {
  grantStandingApproval({
    companyId,
    ownerId: owner.id,
    kinds: ["plan", "public_deploy", "spend", "external_communication"],
  });

  const cases: [string, string][] = [
    ["project plan approval", "auto_approved"],
    ["approve_project_plan", "auto_approved"],
    ["Project Plan and Budget Approval", "auto_approved"],
    ["publishing the customer site", "auto_approved"],
    ["public site publishing approval", "auto_approved"],
    ["deployment approval", "auto_approved"],
    ["spend approval for the invoice", "auto_approved"],
    ["approve purchase", "auto_approved"],
    ["send the client an email", "auto_approved"],
    ["outreach to the client", "auto_approved"],
    ["credential_use", "pending"],
    ["Approval to use the client's credentials", "pending"],
    ["bulk data export", "pending"],
    ["share the data export", "pending"],
    ["ship it", "pending"],
  ];

  for (const [kind, expected] of cases) {
    const decision = proposeDecision({
      companyId,
      requestedByEmployeeId: null,
      taskId: null,
      projectId: null,
      kind,
      title: `Wording: ${kind}`,
      businessReason: "Wording check.",
      action: {},
    });
    assert.equal(decision.status, expected, `"${kind}" should be ${expected}`);
  }
});

test("revoking the grant restores manual approval", () => {
  revokeStandingApproval({ companyId, ownerId: owner.id });
  assert.equal(getStandingApproval(companyId).granted, false);
  assert.equal(plan(40).status, "pending");
});
