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

test("revoking the grant restores manual approval", () => {
  revokeStandingApproval({ companyId, ownerId: owner.id });
  assert.equal(getStandingApproval(companyId).granted, false);
  assert.equal(plan(40).status, "pending");
});
