import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import { getDb, nowIso } from "../src/lib/db";
import {
  createRun,
  createTask,
  getComputerForEmployee,
  getOwner,
  getTask,
  grantHumanControl,
  listEmployees,
  listRuns,
  listTasks,
  releaseHumanControl,
} from "../src/lib/domain/repo";
import { cancelTaskTree } from "../src/lib/domain/commands";
import { workerTick } from "../src/lib/engine/orchestrator";
import { closeDb } from "../src/lib/db";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

const companyId = seedCompany();
const owner = getOwner(companyId);
const developer = listEmployees(companyId).find((employee) => /Web Developer/.test(employee.title))!;
const WORKER = "recovery-worker";

test.after(() => {
  closeDb();
  cleanup();
});

test("an expired lease is recovered and the work retried exactly once", async () => {
  const task = createTask({
    companyId,
    title: "Write a short process note",
    description: "Produce a short written note about the delivery process.",
    kind: "work",
    assigneeId: developer.id,
    acceptanceCriteria: ["A written note exists"],
    requiredChecks: [],
    status: "running",
  });
  const run = createRun({
    companyId,
    taskId: task.id,
    employeeId: developer.id,
    attempt: 1,
    mode: "simulated",
    costEstimateCents: 5,
  });
  // Claim with a lease that has already expired: the worker that held it is gone.
  getDb()
    .prepare("UPDATE task_runs SET status = 'running', worker_id = 'dead-worker', lease_expires_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 60_000).toISOString(), run.id);
  getDb().prepare("UPDATE tasks SET attempt_count = 1 WHERE id = ?").run(task.id);

  await workerTick(companyId, WORKER);
  await workerTick(companyId, WORKER);

  const runs = listRuns(companyId, task.id);
  const interrupted = runs.filter((candidate) => candidate.status === "interrupted");
  const succeeded = runs.filter((candidate) => candidate.status === "succeeded");
  assert.equal(interrupted.length, 1, "the stale run is marked interrupted, not resumed");
  assert.equal(succeeded.length, 1, "exactly one retry completed");
  assert.equal(runs.length, 2);
  assert.ok(runs.some((candidate) => candidate.attempt === 2));
});

test("cancellation propagates to delegated work and stops new execution", async () => {
  const parent = createTask({
    companyId,
    title: "Parent work",
    description: "Delegates a subtask.",
    kind: "work",
    assigneeId: developer.id,
    acceptanceCriteria: ["Parent exists"],
    status: "blocked",
  });
  const child = createTask({
    companyId,
    parentTaskId: parent.id,
    title: "Child work",
    description: "Delegated subtask.",
    kind: "work",
    assigneeId: developer.id,
    acceptanceCriteria: ["Child exists"],
    status: "pending",
  });

  const cancelled = cancelTaskTree({ companyId, taskId: parent.id, actorId: owner.id, reason: "Test cancellation" });
  assert.deepEqual(new Set(cancelled), new Set([parent.id, child.id]));
  assert.equal(getTask(companyId, child.id)!.status, "cancelled");
  assert.equal(getTask(companyId, child.id)!.cancelRequested, true);

  const runsBefore = listRuns(companyId).length;
  await workerTick(companyId, WORKER);
  assert.equal(listRuns(companyId).length, runsBefore, "cancelled work must not start");
});

test("human takeover blocks competing agent actions", async () => {
  const computer = getComputerForEmployee(companyId, developer.id)!;
  grantHumanControl(companyId, developer.id, owner.id, new Date(Date.now() + 60_000).toISOString());

  const task = createTask({
    companyId,
    title: "Build something while the owner is in control",
    description: "Should not run.",
    kind: "work",
    assigneeId: developer.id,
    acceptanceCriteria: ["Blocked by takeover"],
    status: "pending",
  });
  await workerTick(companyId, WORKER);

  const stored = getTask(companyId, task.id)!;
  assert.equal(stored.status, "blocked");
  assert.match(stored.blockedReason ?? "", /owner is in control|human/i);
  assert.equal(listRuns(companyId, task.id).length, 0);
  assert.equal(computer.employeeId, developer.id);
});

test("budget exhaustion prevents dispatch", async () => {
  // Release the lock taken by the previous test so budget is the first blocker.
  releaseHumanControl(companyId, developer.id);
  getDb()
    .prepare(
      "INSERT INTO ledger_entries (id, company_id, kind, category, amount_cents, currency, description, created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run("led_test_exhaust", companyId, "recorded", "model", 100_000, "USD", "Test exhaustion", nowIso());

  const task = createTask({
    companyId,
    title: "Work that must not dispatch",
    description: "Budget is exhausted.",
    kind: "work",
    assigneeId: developer.id,
    acceptanceCriteria: ["Never runs"],
    status: "pending",
  });
  await workerTick(companyId, WORKER);
  const stored = getTask(companyId, task.id)!;
  assert.equal(stored.status, "blocked");
  assert.match(stored.blockedReason ?? "", /Budget exhausted/i);
  assert.equal(listRuns(companyId, task.id).length, 0);
  assert.equal(listTasks(companyId).filter((candidate) => candidate.status === "running").length, 0);
});
