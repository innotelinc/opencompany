import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import { closeDb } from "../src/lib/db";
import { createDecision, findDeployDecision } from "../src/lib/domain/repo";
import { planDeployDecision } from "../src/lib/engine/deploy-decision";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

test.after(() => {
  closeDb();
  cleanup();
});

test("a standing approval is found for its deliverable, even with no project", () => {
  const companyId = seedCompany();
  createDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "public_deploy",
    title: "Publish the site",
    businessReason: "Standing approval.",
    action: { kind: "public_deploy", deliverableId: "del_standing", target: "https://example.test/site" },
    actionHash: "hash",
    risk: "high",
    status: "auto_approved",
  });

  assert.equal(findDeployDecision(companyId, "del_standing")?.status, "auto_approved");
  assert.equal(findDeployDecision(companyId, "del_another"), null, "another deliverable is unaffected");
});

test("a decision that no longer stands is not reused", () => {
  const companyId = seedCompany();
  for (const status of ["rejected", "invalidated"] as const) {
    createDecision({
      companyId,
      requestedByEmployeeId: null,
      taskId: null,
      projectId: null,
      kind: "public_deploy",
      title: `Publish (${status})`,
      businessReason: "Not standing.",
      action: { kind: "public_deploy", deliverableId: `del_${status}` },
      actionHash: "hash",
      risk: "high",
      status,
    });
    assert.equal(findDeployDecision(companyId, `del_${status}`), null, `${status} does not stand`);
  }
});

test("the plan reuses a standing approval and waits on the owner otherwise", () => {
  const plan = (status: string | null) => planDeployDecision({ servedByThisApp: false, standing: status ? { status } : null });
  assert.equal(plan(null), "propose", "nothing yet means ask once");
  assert.equal(plan("auto_approved"), "reuse");
  assert.equal(plan("pending"), "wait", "wait for the owner");
  assert.equal(plan("approved"), "wait", "the owner's decision already stands");
  assert.equal(plan("rejected"), "propose", "a rejection is not an approval");
});

test("the company's own site needs no deploy decision at all", () => {
  assert.equal(planDeployDecision({ servedByThisApp: true, standing: null }), "served");
  assert.equal(planDeployDecision({ servedByThisApp: true, standing: { status: "pending" } }), "served");
});
