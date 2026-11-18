import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import {
  closeDb,
} from "../src/lib/db";
import {
  createRoutine,
  createTask,
  latestDeliverableVersion,
  listActivity,
  listDeliverables,
  listEmployees,
  listRoutines,
  listTasks,
} from "../src/lib/domain/repo";
import { workerTick } from "../src/lib/engine/orchestrator";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

const WORKER = "test-worker";

async function advance(companyId: string, ticks: number) {
  for (let index = 0; index < ticks; index += 1) {
    await workerTick(companyId, WORKER);
  }
}

function ownerOfRoutine(companyId: string) {
  const employee = listEmployees(companyId).find((member) => /developer|web/i.test(member.title)) ?? listEmployees(companyId)[0];
  assert.ok(employee, "the seeded company should have an employee to assign a routine to");
  return employee!;
}

test("a routine's pass is applied when its checks pass, instead of queueing a review", async (t) => {
  const companyId = seedCompany();
  t.after(() => {
    closeDb();
    cleanup();
  });

  const employee = ownerOfRoutine(companyId);
  createRoutine({
    companyId,
    name: "Public site: link check",
    instructions: "Fetch every page of the public site and confirm its links answer.",
    assigneeId: employee.id,
    intervalMinutes: 15,
    nextRunAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const routine = listRoutines(companyId).find((candidate) => candidate.name === "Public site: link check")!;
  assert.ok(routine);

  await advance(companyId, 2);

  const passes = listTasks(companyId).filter((task) => (task.idempotencyKey ?? "").startsWith(`routine:${routine.id}:`));
  assert.equal(passes.length, 1, "one due cycle starts one pass");
  const pass = passes[0];
  assert.equal(pass.kind, "work");
  assert.equal(pass.status, "completed", `a passing routine pass is applied, was ${pass.status}`);

  const reviews = listTasks(companyId).filter((task) => task.kind === "review" && task.reviewOfTaskId === pass.id);
  assert.equal(reviews.length, 0, "a routine pass must not queue a review entry");

  const activity = listActivity(companyId, 200);
  assert.ok(
    activity.some((event) => event.type === "routine.applied" && event.taskId === pass.id),
    "the pass records that it was applied",
  );
  assert.ok(
    activity.some((event) => event.type === "site.published"),
    "the checked site version is the live one",
  );

  const site = listDeliverables(companyId).find((deliverable) => deliverable.name === "OPENco. public site");
  assert.ok(site, "the pass produces the standing public-site deliverable");
  assert.equal(site!.status, "approved");
  assert.equal(latestDeliverableVersion(companyId, site!.id)?.checksPassed, true);
});

test("a routine skips a cycle while its previous pass is still open", async (t) => {
  const companyId = seedCompany();
  t.after(() => {
    closeDb();
    cleanup();
  });

  const employee = ownerOfRoutine(companyId);
  createRoutine({
    companyId,
    name: "Public site: link audit",
    instructions: "Audit the public site's links.",
    assigneeId: employee.id,
    intervalMinutes: 15,
    nextRunAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const routine = listRoutines(companyId).find((candidate) => candidate.name === "Public site: link audit")!;
  assert.ok(routine);

  // A pass from the previous cycle is still waiting to run.
  createTask({
    companyId,
    title: routine.name,
    description: routine.instructions,
    kind: "work",
    assigneeId: employee.id,
    acceptanceCriteria: [routine.instructions],
    requiredChecks: [],
    status: "pending",
    idempotencyKey: `routine:${routine.id}:in-flight`,
  });

  await advance(companyId, 1);

  const passes = listTasks(companyId).filter((task) => (task.idempotencyKey ?? "").startsWith(`routine:${routine.id}:`));
  assert.equal(passes.length, 1, "the due cycle does not add a second identical pass");
  assert.ok(
    listActivity(companyId, 100).some((event) => event.type === "routine.skipped" && event.taskId === passes[0].id),
    "the skipped cycle is recorded",
  );

  const after = listRoutines(companyId).find((candidate) => candidate.id === routine.id)!;
  assert.ok(Date.parse(after.nextRunAt) > Date.now(), "a skipped cycle moves the routine's next run forward");
  assert.equal(after.lastRunAt, null, "a skipped cycle is not recorded as a run");
});
