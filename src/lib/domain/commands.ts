import { addSeconds, getDb, newId, nowIso } from "@/lib/db";
import {
  createEmployee as createEmployeeRecord,
  createGoal,
  deleteGoal,
  createKnowledgeDoc,
  createTask,
  getCompany,
  getComputerForEmployee,
  getGoal,
  getEmployee,
  getKnowledgeDoc,
  getTask,
  grantHumanControl,
  listChildTasks,
  listDecisions,
  listEmployees,
  listTasks,
  recordActivity,
  releaseHumanControl,
  requestRunCancellation,
  setCompanyHalted,
  setEmployeePaused,
  setEmployeeStatus,
  terminateEmployeeRecord,
  updateDecision,
  updateGoal,
  updateKnowledgeDoc,
  updateTask,
} from "@/lib/domain/repo";

/**
 * Owner-level commands. Each one validates company ownership and records an
 * activity event so the owner can see what changed and why.
 */

export function submitOwnerBrief(input: {
  companyId: string;
  ownerId: string;
  title: string;
  brief: string;
  requirements: string;
  recipient?: string;
  budgetCents?: number;
}): { goalId: string; taskId: string; knowledgeDocId: string } {
  const company = getCompany(input.companyId);
  if (!company) throw new Error("Company not found.");
  if (!input.brief.trim()) throw new Error("A brief is required.");

  const ceo = listEmployees(input.companyId).find((employee) => /chief executive/i.test(employee.title));
  if (!ceo) throw new Error("No AI CEO is configured for this company.");

  const budget = Math.max(0, input.budgetCents ?? 500);
  const goal = createGoal({
    companyId: input.companyId,
    title: input.title.trim(),
    description: input.brief.trim(),
    createdBy: input.ownerId,
    budgetCents: budget,
  });

  const doc = createKnowledgeDoc({
    companyId: input.companyId,
    title: `Customer requirements — ${input.title.trim()}`,
    kind: "requirements",
    body: input.requirements.trim(),
    accessScope: "company",
  });

  const task = createTask({
    companyId: input.companyId,
    title: `Plan: ${input.title.trim()}`,
    description: [
      input.brief.trim(),
      "",
      "Owner brief and customer requirements are stored in the company knowledge base.",
      `Goal budget: ${budget}¢.`,
    ].join("\n"),
    kind: "plan",
    acceptanceCriteria: [
      "Project and tasks proposed with explicit acceptance criteria",
      "Budget allocation stated",
      "Owner approval requested before any external action",
    ],
    assigneeId: ceo.id,
    createdById: ceo.id,
    maxAttempts: 2,
    priority: 5,
    idempotencyKey: `plan:${goal.id}`,
  });

  // Link the requirement document to the goal in its title for retrieval.
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "brief.submitted",
    summary: `Owner submitted "${goal.title}" with a ${budget}¢ budget.`,
    taskId: task.id,
  });
  recordActivity({
    companyId: input.companyId,
    actorType: "system",
    type: "brief.stored",
    summary: `Customer requirements saved as knowledge: ${doc.title}`,
    payload: { knowledgeDocId: doc.id },
  });
  return { goalId: goal.id, taskId: task.id, knowledgeDocId: doc.id };
}

/** Cancel a task and everything it delegated. */
export function cancelTaskTree(input: { companyId: string; taskId: string; actorId: string; reason?: string }): string[] {
  const cancelled: string[] = [];
  const walk = (taskId: string) => {
    const task = getTask(input.companyId, taskId);
    if (!task) return;
    if (["completed", "cancelled"].includes(task.status)) return;
    requestRunCancellation(input.companyId, taskId);
    updateTask(input.companyId, taskId, {
      status: "cancelled",
      cancelRequested: true,
      blockedReason: input.reason ?? "Cancelled by the owner.",
    });
    getDb()
      .prepare(
        "UPDATE task_runs SET cancel_requested = 1 WHERE company_id = ? AND task_id = ? AND status IN ('queued','running')",
      )
      .run(input.companyId, taskId);
    for (const decision of listDecisions(input.companyId, "pending")) {
      if (decision.taskId === taskId) {
        updateDecision(input.companyId, decision.id, {
          status: "invalidated",
          invalidatedReason: "The underlying task was cancelled.",
          decidedBy: input.actorId,
        });
      }
    }
    cancelled.push(taskId);
    if (task.projectId) {
      for (const sibling of listDecisions(input.companyId, "pending")) {
        if (sibling.kind === "plan" && String(sibling.action.projectId ?? "") === task.projectId) {
          updateDecision(input.companyId, sibling.id, {
            status: "invalidated",
            invalidatedReason: "The plan was cancelled.",
            decidedBy: input.actorId,
          });
        }
      }
    }
    for (const child of listChildTasks(input.companyId, taskId)) walk(child.id);
  };
  walk(input.taskId);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "task.cancelled",
    summary: `Owner cancelled ${cancelled.length} task(s). In-flight external actions cannot be recalled.`,
    taskId: input.taskId,
    payload: { cancelled },
  });
  return cancelled;
}

export function retryTask(input: { companyId: string; taskId: string; actorId: string }): void {
  const task = getTask(input.companyId, input.taskId);
  if (!task) throw new Error("Task not found.");
  if (!["blocked", "failed", "cancelled"].includes(task.status)) {
    throw new Error(`Task is ${task.status}; only blocked tasks can be retried.`);
  }
  updateTask(input.companyId, task.id, {
    status: "pending",
    blockedReason: null,
    cancelRequested: false,
    attemptCount: 0,
  });
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "task.retried",
    summary: `Owner retried "${task.title}".`,
    taskId: task.id,
  });
}

export function haltCompany(input: { companyId: string; actorId: string; reason: string }): {
  cancelledRuns: number;
  inFlightNote: string;
} {
  const company = getCompany(input.companyId);
  if (!company) throw new Error("Company not found.");
  const reason = input.reason.trim() || "Emergency stop requested by the owner.";
  setCompanyHalted(input.companyId, true, reason);
  const runs = requestRunCancellationAll(input.companyId);
  // Stop claiming new work, but keep records: nothing is deleted.
  for (const employee of listEmployees(input.companyId)) {
    if (employee.status === "working") setEmployeeStatus(input.companyId, employee.id, "paused");
  }
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "company.halted",
    summary: `Emergency stop: ${reason}`,
  });
  return {
    cancelledRuns: runs,
    inFlightNote:
      "Agent tool calls stop at the next checkpoint and queued runs will not start. An external action already executing cannot be recalled; check Administration → External actions for any row left in 'executing', which is marked uncertain and never retried automatically.",
  };
}

function requestRunCancellationAll(companyId: string): number {
  const result = getDb()
    .prepare(
      "UPDATE task_runs SET cancel_requested = 1 WHERE company_id = ? AND status IN ('queued','running')",
    )
    .run(companyId);
  return result.changes;
}

export function resumeCompany(input: { companyId: string; actorId: string }): void {
  setCompanyHalted(input.companyId, false, "");
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "company.resumed",
    summary: "Owner resumed company operations.",
  });
}

export function pauseEmployee(input: { companyId: string; employeeId: string; actorId: string; paused: boolean }): void {
  const employee = getEmployee(input.companyId, input.employeeId);
  if (!employee) throw new Error("Employee not found in this company.");
  setEmployeePaused(input.companyId, employee.id, input.paused);
  if (input.paused) {
    getDb()
      .prepare(
        "UPDATE task_runs SET cancel_requested = 1 WHERE company_id = ? AND employee_id = ? AND status IN ('queued','running')",
      )
      .run(input.companyId, employee.id);
  }
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: input.paused ? "employee.paused" : "employee.resumed",
    summary: `Owner ${input.paused ? "paused" : "resumed"} ${employee.name}.`,
  });
}

/**
 * Fire an employee through the portal.
 *
 * This is a soft delete on purpose: the person comes off the roster immediately,
 * their in-flight work is cancelled and their pending decisions are invalidated,
 * but every task, run and ledger row keeps pointing at a real record, so the
 * audit trail and the money history stay intact.
 */
export function terminateEmployee(input: {
  companyId: string;
  employeeId: string;
  actorId: string;
  reason?: string;
}): { cancelledTasks: number; invalidatedDecisions: number } {
  const employee = getEmployee(input.companyId, input.employeeId);
  if (!employee) throw new Error("Employee not found in this company.");
  if (employee.terminatedAt) throw new Error(`${employee.name} has already left the company.`);
  if (/chief executive/i.test(employee.title)) {
    throw new Error("Hire or promote another CEO before firing this one — the company needs a planner.");
  }

  const openStatuses = ["pending", "running", "blocked", "awaiting_review", "awaiting_approval"];
  const owned = listTasks(input.companyId).filter(
    (task) => task.assigneeId === employee.id && openStatuses.includes(task.status),
  );
  getDb()
    .prepare(
      "UPDATE task_runs SET cancel_requested = 1 WHERE company_id = ? AND employee_id = ? AND status IN ('queued','running')",
    )
    .run(input.companyId, employee.id);
  for (const task of owned) {
    updateTask(input.companyId, task.id, {
      status: "cancelled",
      cancelRequested: true,
      blockedReason: `${employee.name} left the company.`,
    });
  }

  let invalidatedDecisions = 0;
  for (const decision of listDecisions(input.companyId, "pending")) {
    if (decision.requestedByEmployeeId !== employee.id) continue;
    updateDecision(input.companyId, decision.id, {
      status: "invalidated",
      invalidatedReason: `${employee.name} left the company before this was decided.`,
      decidedBy: input.actorId,
    });
    invalidatedDecisions += 1;
  }

  releaseHumanControl(input.companyId, employee.id);
  terminateEmployeeRecord(input.companyId, employee.id, input.reason?.trim() || "Left the company.");

  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "employee.terminated",
    summary: `Owner fired ${employee.name} (${employee.title}). ${owned.length} open task(s) cancelled, ${invalidatedDecisions} decision(s) invalidated.`,
    payload: { employeeId: employee.id, reason: input.reason ?? null, tasks: owned.map((task) => task.id) },
  });

  return { cancelledTasks: owned.length, invalidatedDecisions };
}

export function takeOverComputer(input: { companyId: string; employeeId: string; actorId: string }): void {
  const employee = getEmployee(input.companyId, input.employeeId);
  if (!employee) throw new Error("Employee not found in this company.");
  const computer = getComputerForEmployee(input.companyId, employee.id);
  if (!computer) throw new Error("This employee has no computer.");
  grantHumanControl(input.companyId, employee.id, input.actorId, addSeconds(nowIso(), 900));
  getDb()
    .prepare(
      "UPDATE task_runs SET cancel_requested = 1 WHERE company_id = ? AND employee_id = ? AND status IN ('queued','running')",
    )
    .run(input.companyId, employee.id);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "computer.takeover",
    summary: `Owner took control of ${employee.name}'s computer; agent actions are blocked for 15 minutes.`,
  });
}

export function releaseComputer(input: { companyId: string; employeeId: string; actorId: string }): void {
  releaseHumanControl(input.companyId, input.employeeId);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "computer.released",
    summary: "Owner released the computer back to the employee.",
  });
}

export function createCompanyEmployee(input: {
  companyId: string;
  actorId: string;
  name: string;
  title: string;
  roleInstructions: string;
  departmentId: string | null;
  managerId: string | null;
  backend: string;
  allowedTools: string[];
  authority: string;
  spendLimitCents: number;
}): { id: string } {
  if (!input.name.trim() || !input.title.trim()) throw new Error("Name and title are required.");
  if (input.managerId) {
    const manager = getEmployee(input.companyId, input.managerId);
    if (!manager) throw new Error("Manager must belong to this company.");
  }
  if (!["observe", "internal", "limited_external"].includes(input.authority)) {
    throw new Error("Authority must be observe, internal or limited_external.");
  }
  const employee = createEmployeeRecord({ ...input, model: null });
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "employee.created",
    summary: `Owner added ${employee.name} (${employee.title}).`,
    payload: { employeeId: employee.id },
  });
  return { id: employee.id };
}

export function addKnowledge(input: {
  companyId: string;
  actorId: string;
  title: string;
  body: string;
  accessScope: "company" | "department" | "private";
  departmentId?: string | null;
  ownerEmployeeId?: string | null;
}): string {
  if (!input.title.trim()) throw new Error("A title is required.");
  if (input.accessScope === "department" && !input.departmentId) {
    throw new Error("Department-scoped documents need a department.");
  }
  if (input.accessScope === "private" && !input.ownerEmployeeId) {
    throw new Error("Private documents need an owning employee.");
  }
  const doc = createKnowledgeDoc({
    companyId: input.companyId,
    title: input.title.trim(),
    body: input.body,
    accessScope: input.accessScope,
    departmentId: input.departmentId ?? null,
    ownerEmployeeId: input.ownerEmployeeId ?? null,
    kind: "document",
  });
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "knowledge.created",
    summary: `Owner added "${doc.title}" (${doc.accessScope}).`,
    payload: { knowledgeDocId: doc.id },
  });
  return doc.id;
}

export function editKnowledge(input: { companyId: string; actorId: string; docId: string; body: string }): void {
  const doc = getKnowledgeDoc(input.companyId, input.docId);
  if (!doc) throw new Error("Document not found in this company.");
  updateKnowledgeDoc(input.companyId, doc.id, input.body, input.actorId);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "knowledge.updated",
    summary: `Owner edited "${doc.title}" (now v${doc.version + 1}).`,
    payload: { knowledgeDocId: doc.id },
  });
}

export function createRoutineForEmployee(input: {
  companyId: string;
  actorId: string;
  name: string;
  instructions: string;
  employeeId: string;
  intervalMinutes: number;
}): void {
  const employee = getEmployee(input.companyId, input.employeeId);
  if (!employee) throw new Error("Employee not found in this company.");
  if (input.intervalMinutes < 5) throw new Error("Routine interval must be at least 5 minutes.");
  getDb()
    .prepare(
      "INSERT INTO routines (id, company_id, name, instructions, assignee_id, interval_minutes, next_run_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      newId("rtn"),
      input.companyId,
      input.name,
      input.instructions,
      employee.id,
      input.intervalMinutes,
      new Date(Date.now() + input.intervalMinutes * 60_000).toISOString(),
      nowIso(),
    );
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "routine.created",
    summary: `Owner scheduled "${input.name}" every ${input.intervalMinutes} minutes for ${employee.name}.`,
  });
}

export function createAdHocTask(input: {
  companyId: string;
  actorId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  employeeId: string;
  projectId?: string | null;
}): string {
  const employee = getEmployee(input.companyId, input.employeeId);
  if (!employee) throw new Error("Employee not found in this company.");
  const criteria = input.acceptanceCriteria
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!criteria.length) throw new Error("At least one acceptance criterion is required.");
  const task = createTask({
    companyId: input.companyId,
    projectId: input.projectId ?? null,
    title: input.title,
    description: input.description,
    kind: "work",
    acceptanceCriteria: criteria,
    requiredChecks: ["files_exist"],
    assigneeId: employee.id,
    status: "pending",
  });
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "task.created",
    summary: `Owner assigned "${task.title}" to ${employee.name}.`,
    taskId: task.id,
  });
  return task.id;
}

/** The statuses a goal can hold. Anything else is a typo, not a state. */
export const GOAL_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

function assertGoalStatus(status: string): asserts status is GoalStatus {
  if (!(GOAL_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Goal status must be one of ${GOAL_STATUSES.join(", ")}.`);
  }
}

function ownedGoal(companyId: string, goalId: string) {
  const goal = getGoal(companyId, goalId);
  if (!goal) throw new Error("That goal does not belong to this company.");
  return goal;
}

export function createOwnerGoal(input: {
  companyId: string;
  actorId: string;
  title: string;
  description?: string;
  budgetCents?: number;
}): string {
  const title = input.title.trim();
  if (!title) throw new Error("A goal needs a title.");
  const goal = createGoal({
    companyId: input.companyId,
    title,
    description: input.description?.trim() ?? "",
    createdBy: input.actorId,
    budgetCents: Math.max(0, Math.round(input.budgetCents ?? 0)),
  });
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "goal.created",
    summary: `Owner set the goal "${goal.title}".`,
    payload: { goalId: goal.id },
  });
  return goal.id;
}

export function updateOwnerGoal(input: {
  companyId: string;
  actorId: string;
  goalId: string;
  title?: string;
  description?: string;
  budgetCents?: number;
  status?: string;
}): void {
  const goal = ownedGoal(input.companyId, input.goalId);
  const title = input.title?.trim();
  if (title !== undefined && !title) throw new Error("A goal needs a title.");
  if (input.status !== undefined) assertGoalStatus(input.status);
  updateGoal(input.companyId, goal.id, {
    title,
    description: input.description?.trim(),
    budgetCents: input.budgetCents,
    status: input.status,
  });
  const changes: string[] = [];
  if (title !== undefined && title !== goal.title) changes.push(`renamed to "${title}"`);
  if (input.description !== undefined && input.description.trim() !== goal.description) changes.push("description updated");
  if (input.budgetCents !== undefined && input.budgetCents !== goal.budgetCents) {
    changes.push(`budget set to ${Math.max(0, Math.round(input.budgetCents))}¢`);
  }
  if (input.status !== undefined && input.status !== goal.status) changes.push(`status ${input.status}`);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "goal.updated",
    summary: `Owner changed the goal "${title || goal.title}"${changes.length ? `: ${changes.join(", ")}` : ""}.`,
    payload: { goalId: goal.id },
  });
}

/**
 * Remove a goal. Work already delivered for it stays: projects and reports are
 * detached, not deleted.
 */
export function deleteOwnerGoal(input: { companyId: string; actorId: string; goalId: string }): void {
  const goal = ownedGoal(input.companyId, input.goalId);
  deleteGoal(input.companyId, goal.id);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "goal.deleted",
    summary: `Owner removed the goal "${goal.title}". Its projects and reports were kept.`,
    payload: { goalId: goal.id },
  });
}

