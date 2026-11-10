import "./helpers";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  getCompanyBySlug,
  getExternalAction,
  getOwner,
  latestDeliverableVersion,
  listDecisions,
  listDeliverables,
  listEmployees,
  listReports,
  listRuns,
  listTasks,
  listExternalActions,
} from "../src/lib/domain/repo";
import { submitOwnerBrief } from "../src/lib/domain/commands";
import { approveDecision } from "../src/lib/domain/decisions";
import { workerTick } from "../src/lib/engine/orchestrator";
import { closeDb } from "../src/lib/db";
import { seedCompany } from "../scripts/seed";
import { REQUIREMENTS, cleanup } from "./helpers";

const WORKER = "test-worker";

async function advance(companyId: string, ticks: number) {
  for (let index = 0; index < ticks; index += 1) {
    await workerTick(companyId, WORKER);
  }
}

test("owner brief becomes an approved, reviewed, reported deliverable", async (t) => {
  const companyId = seedCompany();
  const company = getCompanyBySlug("test-studio")!;
  const owner = getOwner(companyId);
  assert.equal(company.id, companyId);

  t.after(() => {
    closeDb();
    cleanup();
  });

  const brief = submitOwnerBrief({
    companyId,
    ownerId: owner.id,
    title: "Prepare a small website for Larkspur & Ledger",
    brief: "Prepare a small website for this customer using the attached requirements.",
    requirements: REQUIREMENTS,
    budgetCents: 500,
  });
  assert.ok(brief.taskId);

  // The CEO plans, then stops for the owner.
  await advance(companyId, 3);
  const planDecision = listDecisions(companyId, "pending").find((decision) => decision.kind === "plan");
  assert.ok(planDecision, "a plan decision should wait for the owner");
  assert.equal(planDecision!.status, "pending");

  const plannedTasks = listTasks(companyId).filter((task) => task.projectId && task.kind === "work");
  assert.ok(plannedTasks.length >= 2, "plan should create at least research and build tasks");
  for (const task of plannedTasks) {
    assert.ok(task.acceptanceCriteria.length > 0, `task ${task.title} must have acceptance criteria`);
    assert.equal(task.status, "blocked", "work must not start before owner approval");
  }

  // No work may run before the plan is approved.
  const runsBefore = listRuns(companyId).filter((run) => run.taskId !== brief.taskId);
  assert.equal(runsBefore.length, 0, "no employee work before plan approval");

  const approved = approveDecision({
    companyId,
    decisionId: planDecision!.id,
    actor: { type: "human", id: owner.id },
    note: "Approved in test.",
  });
  assert.equal(approved.ok, true, approved.reason ?? "approval should succeed");

  await advance(companyId, 40);

  const tasks = listTasks(companyId);
  const work = tasks.filter((task) => task.kind === "work");
  const reviews = tasks.filter((task) => task.kind === "review");
  assert.ok(work.length >= 2);
  assert.ok(reviews.length >= 2, "each delivered work task should create an independent review");
  for (const task of work) {
    assert.equal(task.status, "completed", `${task.title} should be complete, was ${task.status}`);
  }
  for (const review of reviews) {
    assert.equal(review.status, "completed");
    const reviewed = tasks.find((task) => task.id === review.reviewOfTaskId);
    assert.ok(reviewed);
    assert.notEqual(review.assigneeId, reviewed!.assigneeId, "reviewer must be independent from the executor");
  }

  // Deliverables exist on disk, passed checks, and kept a version.
  const deliverables = listDeliverables(companyId);
  const website = deliverables.find((deliverable) => deliverable.kind === "website");
  assert.ok(website, "a website deliverable should exist");
  const version = latestDeliverableVersion(companyId, website!.id);
  assert.ok(version);
  assert.equal(version!.checksPassed, true, "checks must pass");
  assert.ok(version!.manifest.length >= 4);
  assert.ok(fs.existsSync(`${version!.artifactPath}/index.html`));
  assert.ok(fs.existsSync(`${version!.artifactPath}/styles.css`));
  for (const check of version!.checks) {
    assert.equal(check.passed, true, `${check.id}: ${check.detail}`);
  }
  assert.equal(website!.status, "approved");

  // One successful run per task, all labelled simulated.
  const runs = listRuns(companyId);
  assert.ok(runs.every((run) => run.mode === "simulated"), "deterministic runs are simulated");
  for (const task of tasks) {
    const succeeded = runs.filter((run) => run.taskId === task.id && run.status === "succeeded");
    assert.equal(succeeded.length, 1, `${task.title} should have exactly one successful run`);
  }

  // CEO report exists and reflects real records.
  const report = listReports(companyId)[0];
  assert.ok(report, "an operating report should be published");
  assert.match(report!.bodyMd, /What was delivered/);
  assert.match(report!.bodyMd, /Open items for the owner/);

  // Deployment waits for the owner, and nothing is published.
  const deploy = listDecisions(companyId, "pending").find((decision) => decision.kind === "public_deploy");
  assert.ok(deploy, "a deployment decision should wait for the owner");
  assert.equal(listExternalActions(companyId).length, 0, "no external action before approval");

  // Approving the deployment produces a clear blocked provider state.
  const deployApproved = approveDecision({
    companyId,
    decisionId: deploy!.id,
    actor: { type: "human", id: owner.id },
  });
  assert.equal(deployApproved.ok, true);
  await advance(companyId, 3);
  const external = listExternalActions(companyId);
  assert.equal(external.length, 1);
  const stored = getExternalAction(companyId, external[0].id)!;
  assert.equal(stored.status, "blocked", "no deployment provider is configured");
  assert.equal(stored.result?.published, false);
  assert.match(String(stored.result?.reason), /No public deployment provider/i);

  // Employees are idle, nothing left running.
  assert.equal(listEmployees(companyId).filter((employee) => employee.status === "working").length, 0);
});
