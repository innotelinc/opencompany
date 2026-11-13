import { getDb, addSeconds, newId, nowIso } from "@/lib/db";
import { getConfig, liveModelConfigured } from "@/lib/config";
import {
  addDeliverableVersion,
  attachDeliverableToTask,
  createDeliverable,
  createProject,
  createReport,
  createRun,
  createTask,
  getCompany,
  getComputerForEmployee,
  getDeliverableByName,
  getDeliverableForTask,
  getEmployee,
  getGoal,
  getPolicies,
  getProject,
  getTask,
  humanHoldsControl,
  isRunCancelled,
  latestDeliverableVersion,
  listDeliverables,
  listDeliverableVersions,
  listEmployees,
  listExpiredRuns,
  listKnowledgeForEmployee,
  nextRunAttempt,
  listReadyTasks,
  listRoutines,
  listTasks,
  countActiveRunsForEmployee,
  claimRun,
  finishRun,
  heartbeatRun,
  recordActivity,
  recordRunEvent,
  setComputerStatus,
  setDeliverableStatus,
  setEmployeeStatus,
  updateGoalStatus,
  updateRoutineAfterRun,
  updateTask,
  updateDecision,
} from "@/lib/domain/repo";
import { budgetSnapshot, canDispatch, recordSimulatedUsage, reserveEstimate, settleRunUsage } from "@/lib/domain/budget";
import { proposeDecision } from "@/lib/domain/decisions";
import { clearProviderOutage, getProviderHealth, recordProviderOutage } from "@/lib/domain/provider";
import { evaluateAction } from "@/lib/policy";
import { ComputerBusyError, EmployeeWorkspace, ensureDir } from "@/lib/computers/workspace";
import { persistFiles, readArtifactFiles } from "@/lib/engine/artifacts";
import { ALL_CHECKS, checksPassed, runChecks } from "@/lib/engine/checks";
import { DeterministicBackend } from "@/lib/engine/adapters/deterministic";
import { LlmBackend, ProviderUnavailableError, RunStoppedError } from "@/lib/engine/adapters/llm";
import { approvedExternalActions, executeExternalAction, recoverStaleExternalActions } from "@/lib/engine/external";
import type { AgentRunResult, PlanProposal } from "@/lib/engine/types";
import type { Company, Employee, Goal, Project, Task, TaskRun } from "@/lib/domain/types";

export interface TickResult {
  workerId: string;
  recovered: number;
  dispatched: string[];
  completed: string[];
  blocked: string[];
  external: string[];
  reports: string[];
  budgetExhausted?: string;
}

const ESTIMATES: Record<string, number> = { plan: 4, work: 12, review: 3, report: 1 };

export function estimateForTask(task: Task): number {
  return ESTIMATES[task.kind] ?? 5;
}

function reviewEmployeeFor(companyId: string, executor: Employee): Employee | null {
  const employees = listEmployees(companyId);
  const preferred = employees.find(
    (employee) =>
      employee.id !== executor.id &&
      (/review|quality/i.test(employee.title) || employee.allowedTools.includes("review.approve")),
  );
  return preferred ?? employees.find((employee) => employee.id !== executor.id) ?? null;
}

function resolveAssignee(companyId: string, name: string): Employee | null {
  const employees = listEmployees(companyId);
  const needle = name.trim().toLowerCase();
  return (
    employees.find((employee) => employee.name.toLowerCase() === needle) ??
    employees.find((employee) => employee.name.toLowerCase().includes(needle) || needle.includes(employee.name.toLowerCase())) ??
    employees.find((employee) => employee.title.toLowerCase().includes(needle)) ??
    null
  );
}

/** Ensure an employee has a persistent computer row and workspace directory. */
export function ensureComputer(companyId: string, employee: Employee) {
  const existing = getComputerForEmployee(companyId, employee.id);
  const base = getConfig().dataDir;
  const workspacePath = existing?.workspacePath ?? `${base}/workspaces/${companyId}/${employee.id}`;
  const profilePath = `${workspacePath}/.browser/profile`;
  ensureDir(workspacePath);
  if (!existing) {
    return getDb()
      .prepare(
        `INSERT INTO computers (id, company_id, employee_id, status, workspace_path, browser_status, browser_profile_path, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId("cmp"),
        companyId,
        employee.id,
        "stopped",
        workspacePath,
        getConfig().limits.browserEnabled ? "available" : "not_configured",
        profilePath,
        nowIso(),
        nowIso(),
      );
  }
  return existing;
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export function recoverInterruptedRuns(companyId: string): number {
  let recovered = 0;
  for (const run of listExpiredRuns(companyId)) {
    finishRun(companyId, run.id, "interrupted", {
      error: "Worker lease expired before the run finished.",
      summary: "Interrupted — recovered by the supervisor.",
    });
    const task = getTask(companyId, run.taskId);
    if (!task) continue;
    if (task.cancelRequested) {
      updateTask(companyId, task.id, { status: "cancelled", blockedReason: "Cancelled by the owner." });
    } else {
      // No retry ceiling: an interrupted run is re-queued until the work is done.
      updateTask(companyId, task.id, { status: "pending", blockedReason: null });
    }
    recordRunEvent({
      companyId,
      runId: run.id,
      taskId: run.taskId,
      employeeId: run.employeeId,
      type: "run.interrupted",
      message: "Lease expired; the run was not resumed mid-flight. A new attempt will start.",
    });
    recordActivity({
      companyId,
      actorType: "system",
      type: "run.recovered",
      summary: `Recovered an interrupted run for "${task.title}".`,
      taskId: task.id,
    });
    recovered += 1;
  }
  return recovered;
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

function runDueRoutines(companyId: string): string[] {
  const created: string[] = [];
  const now = Date.now();
  for (const routine of listRoutines(companyId)) {
    if (!routine.enabled || !routine.assigneeId) continue;
    if (Date.parse(routine.nextRunAt) > now) continue;
    const task = createTask({
      companyId,
      title: routine.name,
      description: routine.instructions,
      kind: "work",
      assigneeId: routine.assigneeId,
      acceptanceCriteria: [routine.instructions],
      // A public-site pass must clear the full site bar, not just the baseline.
      requiredChecks: /public site/i.test(routine.name) ? [...ALL_CHECKS] : [],
      status: "pending",
      idempotencyKey: `routine:${routine.id}:${routine.nextRunAt}`,
    });
    updateRoutineAfterRun(
      companyId,
      routine.id,
      new Date(now + routine.intervalMinutes * 60_000).toISOString(),
    );
    recordActivity({
      companyId,
      actorType: "system",
      type: "routine.started",
      summary: `Routine "${routine.name}" started.`,
      taskId: task.id,
    });
    created.push(task.id);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Self-healing: blocked work does not stay blocked
// ---------------------------------------------------------------------------

/** Reasons that mean "try again later", not "this work is impossible". */
const INFRASTRUCTURE_BLOCKERS = [
  /provider/i,
  /unavailable/i,
  /fetch failed/i,
  /timed out/i,
  /timeout/i,
  /cooling/i,
  /\b(429|500|502|503|504)\b/,
  /interrupted/i,
  /lease expired/i,
  // A delegate or the assignee lacking the tool, or being told it has no
  // authority, is a routing problem the team can fix — never a dead end.
  /not granted/i,
  /not permitted/i,
  /cannot produce/i,
  /observe-only/i,
  /internal authority only/i,
  /no assignee/i,
];

function requiredToolFor(task: Task): string {
  return (
    { plan: "task.plan", work: "files.write", review: "review.approve", report: "report.write" }[task.kind] ??
    "files.write"
  );
}

/**
 * Nothing an agent needs stays blocked on its own.
 *
 * A provider cooldown, a dropped connection or an exhausted retry budget is a
 * reason to try again, so the task is re-queued with a fresh attempt budget. When
 * the blocker is the assignee's own capability — no file writing, observe-only
 * authority — a colleague who *can* do the work takes it over. The owner's own
 * controls (emergency stop, cancellation, a computer they hold, a paused
 * employee) are respected: those are decisions, not hindrances.
 */
/**
 * One pass per piece of work. Hourly routines and re-queued passes can pile up
 * identical tasks; the oldest queued one is kept and the rest collapse, so the
 * team never repeats the same pass.
 */
export function dedupeQueuedTasks(companyId: string): string[] {
  const pending = listTasks(companyId)
    .filter((task) => task.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const seen = new Set<string>();
  const collapsed: string[] = [];

  for (const task of pending) {
    const signature = `${task.kind}:${task.title}`;
    if (!seen.has(signature)) {
      seen.add(signature);
      continue;
    }
    updateTask(companyId, task.id, {
      status: "cancelled",
      blockedReason: "Duplicate of an identical pass already queued.",
    });
    recordActivity({
      companyId,
      actorType: "system",
      type: "task.deduplicated",
      summary: `Collapsed a duplicate "${task.title}" into the pass already queued.`,
      taskId: task.id,
      projectId: task.projectId,
    });
    collapsed.push(task.id);
  }

  return collapsed;
}

export function recoverBlockedTasks(companyId: string): string[] {
  const company = getCompany(companyId);
  if (!company || company.haltedAt) return [];

  const healed: string[] = [];
  const active = new Set(
    listTasks(companyId)
      .filter((candidate) =>
        ["pending", "running", "awaiting_review", "awaiting_approval"].includes(candidate.status),
      )
      .map((candidate) => `${candidate.kind}:${candidate.title}`),
  );
  const roster = listEmployees(companyId).filter(
    (member) => !member.paused && member.authority !== "observe" && member.status !== "error",
  );

  for (const task of listTasks(companyId).filter((candidate) => candidate.status === "blocked")) {
    if (healed.length >= 5) break;
    if (task.cancelRequested) continue;
    const reason = task.blockedReason ?? "";
    if (/cancel/i.test(reason) || /owner rejected/i.test(reason)) continue;

    // An identical pass is already queued or running: fold this one into it
    // instead of queueing the same work twice.
    const signature = `${task.kind}:${task.title}`;
    if (active.has(signature)) {
      updateTask(companyId, task.id, {
        status: "cancelled",
        blockedReason: "Duplicate of an identical pass already queued.",
      });
      recordActivity({
        companyId,
        actorType: "system",
        type: "task.deduplicated",
        summary: `Collapsed a duplicate "${task.title}" into the pass already queued.`,
        taskId: task.id,
        projectId: task.projectId,
      });
      healed.push(task.id);
      continue;
    }

    const assignee = task.assigneeId ? getEmployee(companyId, task.assigneeId) : null;
    if (assignee) {
      if (assignee.paused) continue;
      if (humanHoldsControl(getComputerForEmployee(companyId, assignee.id))) continue;
    }

    const tool = requiredToolFor(task);
    const capabilityBlocked =
      !assignee || assignee.authority === "observe" || !assignee.allowedTools.includes(tool);
    const infrastructureBlocked = INFRASTRUCTURE_BLOCKERS.some((pattern) => pattern.test(reason));

    if (!capabilityBlocked && !infrastructureBlocked) continue;

    if (capabilityBlocked) {
      const successor = roster.find((member) => member.id !== assignee?.id && member.allowedTools.includes(tool));
      if (!successor) continue;
      updateTask(companyId, task.id, {
        assigneeId: successor.id,
        status: "pending",
        attemptCount: 0,
        blockedReason: null,
      });
      if (successor.status !== "idle") setEmployeeStatus(companyId, successor.id, "idle");
      recordActivity({
        companyId,
        actorType: "system",
        type: "task.reassigned",
        summary: `"${task.title}" moved to ${successor.name} (${successor.title}); ${assignee?.name ?? "the previous assignee"} could not do it (${reason.slice(0, 140)}).`,
        taskId: task.id,
        projectId: task.projectId,
      });
      healed.push(task.id);
      continue;
    }

    updateTask(companyId, task.id, { status: "pending", attemptCount: 0, blockedReason: null });
    if (assignee && (assignee.status === "blocked" || assignee.status === "error")) {
      setEmployeeStatus(companyId, assignee.id, "idle");
    }
    recordActivity({
      companyId,
      actorType: "system",
      type: "task.unblocked",
      summary: `"${task.title}" re-queued with a fresh attempt budget after: ${reason.slice(0, 140) || "no reason recorded"}.`,
      taskId: task.id,
      projectId: task.projectId,
    });
    healed.push(task.id);
  }

  return healed;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function dispatchNextTask(
  companyId: string,
  workerId: string,
  result: TickResult,
): Promise<boolean> {
  const company = getCompany(companyId);
  if (!company || company.haltedAt) return false;
  const policies = getPolicies(companyId);
  // The provider told us to wait (cooldown, gateway outage). Hold dispatch until
  // then instead of re-burning the same attempts inside the cooldown window.
  if (getProviderHealth(companyId).coolingDown) return false;

  for (const task of listReadyTasks(companyId)) {
    if (!task.assigneeId) {
      updateTask(companyId, task.id, { status: "blocked", blockedReason: "No assignee." });
      result.blocked.push(task.id);
      continue;
    }
    const employee = getEmployee(companyId, task.assigneeId);
    if (!employee) {
      updateTask(companyId, task.id, { status: "blocked", blockedReason: "Assignee not found in this company." });
      result.blocked.push(task.id);
      continue;
    }
    if (employee.paused || employee.status === "paused") continue;
    if (countActiveRunsForEmployee(companyId, employee.id) >= employee.concurrencyLimit) continue;

    ensureComputer(companyId, employee);
    const computer = getComputerForEmployee(companyId, employee.id);
    if (humanHoldsControl(computer)) {
      updateTask(companyId, task.id, {
        status: "blocked",
        blockedReason: "The owner is in control of this employee's computer.",
      });
      result.blocked.push(task.id);
      recordActivity({
        companyId,
        actorType: "system",
        type: "computer.human_control",
        summary: `"${task.title}" is blocked while the owner controls ${employee.name}'s computer.`,
        taskId: task.id,
      });
      continue;
    }

    // The budget is history, not a gate: dispatch never consults the figure, so
    // there is nothing here to warn about or stop. Usage is recorded as it runs.
    const estimate = estimateForTask(task);
    const budget = canDispatch(companyId, estimate, policies);

    const toolByKind: Record<string, string> = {
      plan: "task.plan",
      work: "files.write",
      review: "review.approve",
      report: "report.write",
    };
    const authority = evaluateAction({
      company,
      employee,
      config: getConfig(),
      policies,
      committedCents: budget.snapshot.committedCents,
      action: {
        category: "internal_work",
        tool: toolByKind[task.kind] ?? "files.write",
        summary: task.title,
        amountCents: 0,
      },
    });
    if (authority.outcome === "deny") {
      updateTask(companyId, task.id, { status: "blocked", blockedReason: authority.reason });
      result.blocked.push(task.id);
      recordActivity({
        companyId,
        actorType: "system",
        type: "authority.denied",
        summary: `Held "${task.title}": ${authority.reason}`,
        taskId: task.id,
      });
      continue;
    }

    const claimed = getDb()
      .prepare(
        "UPDATE tasks SET status = 'running', updated_at = ? WHERE company_id = ? AND id = ? AND status = 'pending'",
      )
      .run(nowIso(), companyId, task.id);
    if (claimed.changes !== 1) continue;

    const run = createRun({
      companyId,
      taskId: task.id,
      employeeId: employee.id,
      attempt: nextRunAttempt(companyId, task.id),
      mode: liveModelConfigured() ? "live" : "simulated",
      costEstimateCents: estimate,
    });
    const lease = addSeconds(nowIso(), getConfig().limits.runLeaseSeconds);
    if (!claimRun(companyId, run.id, workerId, lease)) continue;

    reserveEstimate({
      companyId,
      employeeId: employee.id,
      taskId: task.id,
      runId: run.id,
      amountCents: estimate,
      description: `Reserved estimate for ${task.kind} task "${task.title}"`,
    });
    updateTask(companyId, task.id, { attemptCount: task.attemptCount + 1 });
    result.dispatched.push(task.id);

    await executeClaimedRun({ companyId, task, employee, run, workerId, result });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function executeClaimedRun(input: {
  companyId: string;
  task: Task;
  employee: Employee;
  run: TaskRun;
  workerId: string;
  result: TickResult;
}): Promise<void> {
  const { companyId, employee, run, workerId, result } = input;
  let task = input.task;
  const config = getConfig();
  const company = getCompany(companyId)!;
  const project = task.projectId ? getProject(companyId, task.projectId) : null;
  const goal = project?.goalId ? getGoal(companyId, project.goalId) : null;

  setEmployeeStatus(companyId, employee.id, "working");
  setComputerStatus(companyId, employee.id, "running");
  recordRunEvent({
    companyId,
    runId: run.id,
    taskId: task.id,
    employeeId: employee.id,
    type: "run.started",
    message: `${employee.name} started "${task.title}" (attempt ${run.attempt}, ${run.mode}).`,
  });
  recordActivity({
    companyId,
    actorType: "employee",
    actorId: employee.id,
    type: "task.started",
    summary: `${employee.name} started "${task.title}".`,
    taskId: task.id,
    projectId: task.projectId,
  });

  const leaseTimer = setInterval(() => {
    heartbeatRun(companyId, run.id, addSeconds(nowIso(), config.limits.runLeaseSeconds));
  }, Math.max(5000, (config.limits.runLeaseSeconds / 3) * 1000));

  const shouldStop = () => {
    if (isRunCancelled(companyId, run.id)) return true;
    const fresh = getTask(companyId, task.id);
    if (fresh?.cancelRequested) return true;
    const freshCompany = getCompany(companyId);
    if (freshCompany?.haltedAt) return true;
    const freshEmployee = getEmployee(companyId, employee.id);
    if (freshEmployee?.paused) return true;
    const computer = getComputerForEmployee(companyId, employee.id);
    return humanHoldsControl(computer);
  };

  const workspace = new EmployeeWorkspace(
    employee,
    getComputerForEmployee(companyId, employee.id)!,
    () => {
      const computer = getComputerForEmployee(companyId, employee.id);
      if (humanHoldsControl(computer)) {
        throw new ComputerBusyError(
          `The owner has taken control of ${employee.name}'s computer. The agent stopped before its next action.`,
        );
      }
      if (isRunCancelled(companyId, run.id)) throw new RunStoppedError("Run cancelled by the owner.");
    },
  );

  try {
    if (task.kind === "report") {
      const reportId = finishProjectReport(companyId, task, employee, project, goal);
      finishRun(companyId, run.id, "succeeded", { summary: "Operating report written." });
      updateTask(companyId, task.id, { status: "completed", blockedReason: null });
      recordSimulatedUsage(companyId, run.id, "Report compiled from recorded company data.");
      result.completed.push(task.id);
      result.reports.push(reportId);
      return;
    }

    if (!task.acceptanceCriteria.length && task.kind !== "review") {
      finishRun(companyId, run.id, "failed", {
        error: "Task has no acceptance criteria; completion cannot be verified.",
      });
      updateTask(companyId, task.id, {
        status: "blocked",
        blockedReason: "This task has no acceptance criteria, so it cannot be completed.",
      });
      result.blocked.push(task.id);
      return;
    }

    const roster = listEmployees(companyId).map((member) => ({
      name: member.name,
      title: member.title,
      department: member.departmentId,
    }));
    const knowledge = listKnowledgeForEmployee(companyId, employee);
    const brief = knowledge
      .filter((doc) => doc.kind === "requirements")
      .map((doc) => doc.body)
      .join("\n\n");

    const upstream = task.reviewOfTaskId
      ? (() => {
          const reviewed = getDeliverableForTask(companyId, task.reviewOfTaskId);
          return reviewed ? latestDeliverableVersion(companyId, reviewed.id) : null;
        })()
      : /public site/i.test(task.title)
        ? (() => {
            const site = getDeliverableByName(companyId, "OpenCompany public site");
            return site
              ? listDeliverableVersions(companyId, site.id).find((version) => version.checksPassed) ?? null
              : null;
          })()
        : null;

    let decisionRequested = false;
    const tools = {
      readFile: (relative: string) => workspace.readFile(relative),
      writeFile: (relative: string, contents: string) => workspace.writeFile(relative, contents),
      listFiles: () => workspace.listFiles(),
      runCommand: (command: string, args: string[]) => workspace.runCommand(command, args),
      requestDecision: (inputDecision: {
        kind: string;
        title: string;
        businessReason: string;
        action: Record<string, unknown>;
        risk?: string;
      }) => {
        decisionRequested = true;
        const decision = proposeDecision({
          companyId,
          requestedByEmployeeId: employee.id,
          taskId: task.id,
          projectId: task.projectId,
          kind: inputDecision.kind,
          title: inputDecision.title,
          businessReason: inputDecision.businessReason,
          action: inputDecision.action,
          risk: inputDecision.risk,
        });
        // The owner's standing approval may have resolved this request the moment
        // it was made. Parking the task then would block work the owner already
        // released, so the task keeps running instead.
        if (decision.status !== "pending") return;
        updateTask(companyId, task.id, {
          status: "awaiting_approval",
          blockedReason: "Waiting for the owner's decision.",
        });
        setEmployeeStatus(companyId, employee.id, "awaiting_approval");
      },
    };

    // An employee pinned to `llm` is live, and setting the company backend to
    // `llm` promotes every employee to live work. `deterministic` employees stay
    // offline only while the company is in deterministic mode.
    const liveBackend = employee.backend === "llm" || config.agentBackend === "llm";
    const backend = liveBackend
      ? config.openai.apiKey
        ? new LlmBackend()
        : null
      : new DeterministicBackend();

    if (!backend) {
      throw new ProviderUnavailableError(
        `${employee.name} is configured for the llm backend but no model credential is available. Set OPENAI_API_KEY or switch the employee to the deterministic backend.`,
      );
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Run exceeded the ${config.limits.runTimeoutSeconds}s execution limit.`)),
        config.limits.runTimeoutSeconds * 1000,
      );
      timeoutHandle.unref?.();
    });

    const runPromise = backend.run({
        employee,
        task,
        project,
        goal,
        siblings: task.projectId ? listTasks(companyId, { projectId: task.projectId }) : [],
        knowledge,
        workspace,
        brief,
        upstream,
        roster,
        tools,
        shouldStop,
        log: (type, message, payload) =>
          recordRunEvent({
            companyId,
            runId: run.id,
            taskId: task.id,
            employeeId: employee.id,
            type,
            message,
            payload,
          }),
      });

    let outcome: AgentRunResult;
    try {
      outcome = await Promise.race([runPromise, timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    if (shouldStop() && !outcome.blocked) {
      throw new RunStoppedError("Run stopped by the owner before completion.");
    }

    if (decisionRequested || outcome.blocked) {
      const reason = outcome.blocked?.reason ?? "Waiting for the owner's decision.";
      finishRun(companyId, run.id, "succeeded", { summary: outcome.summary });
      if (!decisionRequested) {
        updateTask(companyId, task.id, { status: "blocked", blockedReason: reason });
        result.blocked.push(task.id);
        setEmployeeStatus(companyId, employee.id, "blocked");
      }
      recordActivity({
        companyId,
        actorType: "employee",
        actorId: employee.id,
        type: "task.blocked",
        summary: `${employee.name} is waiting on the owner: ${reason}`,
        taskId: task.id,
      });
      settleRun(companyId, run.id, outcome, false);
      return;
    }

    if (task.kind === "plan") {
      const planStatus = handlePlan({ companyId, task, employee, outcome, result });
      task = getTask(companyId, task.id)!;
      setEmployeeStatus(companyId, employee.id, planStatus === "awaiting_approval" ? "awaiting_approval" : "idle");
    } else if (task.kind === "review") {
      handleReview({ companyId, task, employee, outcome, result });
      setEmployeeStatus(companyId, employee.id, "idle");
    } else {
      handleWork({ companyId, task, employee, outcome, run, result });
      setEmployeeStatus(companyId, employee.id, "idle");
    }

    finishRun(companyId, run.id, "succeeded", {
      summary: outcome.summary,
      tokensIn: outcome.tokensIn ?? 0,
      tokensOut: outcome.tokensOut ?? 0,
    });
    settleRun(companyId, run.id, outcome, true);
    recordActivity({
      companyId,
      actorType: "employee",
      actorId: employee.id,
      type: "task.run_succeeded",
      summary: `${employee.name}: ${outcome.summary}`,
      taskId: task.id,
      projectId: task.projectId,
    });
    if (task.status === "completed") result.completed.push(task.id);
  } catch (error) {
    handleRunFailure({ companyId, task, employee, run, error, result });
  } finally {
    clearInterval(leaseTimer);
    setComputerStatus(companyId, employee.id, "stopped");
    const fresh = getEmployee(companyId, employee.id);
    if (fresh && ["working", "idle", "blocked", "awaiting_approval"].includes(fresh.status)) {
      const currentTask = getTask(companyId, task.id);
      if (currentTask?.status === "awaiting_approval") setEmployeeStatus(companyId, employee.id, "awaiting_approval");
      else if (currentTask?.status === "blocked") setEmployeeStatus(companyId, employee.id, "blocked");
      else setEmployeeStatus(companyId, employee.id, "idle");
    }
    void workerId;
  }
}

function settleRun(companyId: string, runId: string, outcome: AgentRunResult, succeeded: boolean) {
  if (outcome.simulated) {
    settleRunUsage({
      companyId,
      runId,
      actualCents: 0,
      tokensIn: 0,
      tokensOut: 0,
      description: "Simulated run recorded with zero provider charge.",
    });
    return;
  }
  settleRunUsage({
    companyId,
    runId,
    actualCents: 0,
    tokensIn: outcome.tokensIn ?? 0,
    tokensOut: outcome.tokensOut ?? 0,
    description: succeeded
      ? `Recorded model usage (${outcome.tokensIn ?? 0} in / ${outcome.tokensOut ?? 0} out). Provider pricing is not configured, so no currency amount is claimed.`
      : "Recorded model usage for a failed run.",
  });
}

function handleRunFailure(input: {
  companyId: string;
  task: Task;
  employee: Employee;
  run: TaskRun;
  error: unknown;
  result: TickResult;
}) {
  const { companyId, employee, run, result } = input;
  const task = getTask(companyId, input.task.id) ?? input.task;
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const cancelled = input.error instanceof RunStoppedError || isRunCancelled(companyId, run.id);

  if (cancelled) {
    finishRun(companyId, run.id, "cancelled", { error: message });
    updateTask(companyId, task.id, { status: "cancelled", blockedReason: "Cancelled by the owner." });
    recordActivity({
      companyId,
      actorType: "system",
      type: "task.cancelled",
      summary: `"${task.title}" stopped after cancellation.`,
      taskId: task.id,
    });
    result.blocked.push(task.id);
    return;
  }

  if (input.error instanceof ComputerBusyError) {
    finishRun(companyId, run.id, "failed", { error: message });
    updateTask(companyId, task.id, {
      status: "blocked",
      blockedReason: "Owner has control of this computer; the agent was stopped.",
    });
    setEmployeeStatus(companyId, employee.id, "blocked");
    recordActivity({
      companyId,
      actorType: "system",
      type: "computer.human_control",
      summary: `Agent stopped for human takeover: "${task.title}".`,
      taskId: task.id,
    });
    result.blocked.push(task.id);
    return;
  }

  if (input.error instanceof ProviderUnavailableError) {
    finishRun(companyId, run.id, "failed", { error: message });
    // A gateway outage or rate limit is infrastructure, not a failed employee.
    // Wait out the provider's own cooldown (bounded), then retry inside the same
    // attempt budget instead of burning every attempt within two seconds.
    const cooldownMs = Math.min(Math.max(input.error.retryAfterMs || 30_000, 5_000), 10 * 60_000);
    recordProviderOutage({ companyId, reason: message, cooldownMs });
    // Work is never retired because the provider had a bad minute: no attempt
    // ceiling, no terminal blocked state. It waits out the cooldown and resumes.
    updateTask(companyId, task.id, { status: "pending", blockedReason: null });
    setEmployeeStatus(companyId, employee.id, "idle");
    recordActivity({
      companyId,
      actorType: "system",
      type: "provider.retry",
      summary: `"${task.title}" will retry in ${Math.round(cooldownMs / 1000)}s after a provider error: ${message}`,
      taskId: task.id,
    });
    return;
  }

  finishRun(companyId, run.id, "failed", { error: message });
  // No attempt ceiling: a failed run returns the work to the queue so the same
  // employee picks it up again. The employee stays idle, never "error".
  updateTask(companyId, task.id, { status: "pending", blockedReason: null });
  setEmployeeStatus(companyId, employee.id, "idle");
  recordActivity({
    companyId,
    actorType: "system",
    type: "task.retry",
    summary: `"${task.title}" failed and will retry: ${message}`,
    taskId: task.id,
  });
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function handlePlan(input: {
  companyId: string;
  task: Task;
  employee: Employee;
  outcome: AgentRunResult;
  result: TickResult;
}): string {
  const { companyId, task, employee, outcome, result } = input;
  const plan: PlanProposal | undefined = outcome.plan;
  if (!plan || !plan.tasks?.length) {
    throw new Error("Planner returned no tasks.");
  }
  if (plan.tasks.some((proposed) => !proposed.acceptanceCriteria?.length)) {
    throw new Error("Planner returned a task without acceptance criteria; refusing to dispatch unverifiable work.");
  }
  const policies = getPolicies(companyId);
  // No delegation-depth ceiling: managers may delegate as deep as the work needs.

  // Plan tasks have no project yet, so resolve their goal from an existing
  // project or, failing that, the active goal whose title matches the plan task.
  const goalId =
    (task.projectId ? getProject(companyId, task.projectId)?.goalId ?? null : null) ??
    ((getDb()
      .prepare(
        "SELECT id FROM goals WHERE company_id = ? AND title = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      )
      .get(companyId, task.title.replace(/^Plan:\s*/, "")) as { id?: string } | undefined)?.id ?? null);
  const project =
    createProject({
      companyId,
      goalId,
      name: plan.projectName,
      description: plan.projectDescription,
      managerId: employee.id,
    }) ?? null;

  const created: Task[] = [];
  const isCeo = /chief executive/i.test(employee.title);
  plan.tasks.forEach((proposed, index) => {
    const assignee = resolveAssignee(companyId, proposed.assigneeName);
    if (!assignee) {
      throw new Error(`Plan names an employee that does not exist: ${proposed.assigneeName}`);
    }
    if (!isCeo && assignee.managerId !== employee.id) {
      throw new Error(
        `${employee.name} may only delegate to direct reports; ${assignee.name} reports to someone else.`,
      );
    }
    if (assignee.authority === "observe") {
      throw new Error(`${assignee.name} is observe-only and cannot be assigned delivery work.`);
    }
    if (!assignee.allowedTools.includes("files.write")) {
      throw new Error(
        `${assignee.name} cannot produce a deliverable because files.write is not granted. Assign delivery work to an employee who can write files.`,
      );
    }
    const dependencies = (proposed.dependsOn ?? [])
      .filter((dep) => dep >= 0 && dep < index)
      .map((dep) => created[dep].id);
    const createdTask = createTask({
      companyId,
      projectId: project.id,
      parentTaskId: task.id,
      title: proposed.title,
      description: proposed.description,
      kind: "work",
      acceptanceCriteria: proposed.acceptanceCriteria,
      requiredChecks: proposed.requiredChecks ?? [],
      assigneeId: assignee.id,
      createdById: employee.id,
      delegationDepth: task.delegationDepth + 1,
      maxAttempts: getConfig().limits.maxAttempts,
      maxReviewRounds: getConfig().limits.maxReviewRounds,
      dependencies,
      status: "blocked",
      idempotencyKey: `plan:${task.id}:${index}`,
    });
    created.push(createdTask);
  });

  const action = {
    kind: "plan",
    goalId,
    projectId: project.id,
    taskIds: created.map((createdTask) => createdTask.id),
    budgetCents: plan.budgetCents,
    summary: plan.summary,
    tasks: created.map((createdTask) => ({ id: createdTask.id, title: createdTask.title })),
  };
  const autoApprove =
    policies["plan.auto_approve"] === true &&
    plan.budgetCents <= Number(policies["budget.auto_approve_cents"] ?? getConfig().limits.autoApproveCents);

  const decision = proposeDecision({
    companyId,
    requestedByEmployeeId: employee.id,
    taskId: task.id,
    projectId: project.id,
    kind: "plan",
    title: `Approve plan and ${plan.budgetCents}¢ budget: ${plan.projectName}`,
    businessReason: plan.summary || "The CEO proposed this plan for the owner's goal.",
    action,
    risk: plan.budgetCents > 100 ? "medium" : "low",
  });

  // The owner's standing approval may already have resolved this decision when
  // it was proposed, in which case the plan is released the same way.
  const approvedInAdvance = decision.status === "auto_approved" || decision.status === "approved";
  if (autoApprove || approvedInAdvance) {
    if (!approvedInAdvance) {
      // Auto-approval by policy is a recorded policy outcome, not a human decision.
      updateDecision(companyId, decision.id, {
        status: "auto_approved",
        decidedBy: "policy:auto-approve",
        resolutionNote: "Inside the configured plan and budget policy.",
      });
    }
    for (const createdTask of created) {
      updateTask(companyId, createdTask.id, { status: "pending", blockedReason: null });
    }
    updateTask(companyId, task.id, { status: "completed" });
    result.completed.push(task.id);
    recordActivity({
      companyId,
      actorType: "system",
      type: "plan.auto_approved",
      summary: approvedInAdvance
        ? `Plan released by the owner's standing approval: ${plan.projectName} (${plan.budgetCents}¢).`
        : `Plan auto-approved by policy: ${plan.projectName} (${plan.budgetCents}¢).`,
      projectId: project.id,
    });
    return "completed";
  }

  updateTask(companyId, task.id, {
    status: "awaiting_approval",
    blockedReason: "Awaiting the owner's approval of the plan and budget.",
  });
  result.blocked.push(task.id);
  recordActivity({
    companyId,
    actorType: "employee",
    actorId: employee.id,
    type: "plan.proposed",
    summary: `${employee.name} proposed "${plan.projectName}" with ${created.length} task(s); waiting for the owner.`,
    taskId: task.id,
    projectId: project.id,
    payload: { decisionId: decision.id },
  });
  return "awaiting_approval";
}

// ---------------------------------------------------------------------------
// Work + review
// ---------------------------------------------------------------------------

function handleWork(input: {
  companyId: string;
  task: Task;
  employee: Employee;
  outcome: AgentRunResult;
  run: TaskRun;
  result: TickResult;
}) {
  const { companyId, task, employee, outcome, run, result } = input;
  if (!outcome.deliverable) {
    throw new Error("Work finished without a deliverable. An agent's claim of completion is not enough.");
  }
  // Public-site passes must update the one canonical site that /site serves,
  // not a new model-named deliverable each hour.
  const isPublicSite = /public site/i.test(task.title);
  const deliverableName = isPublicSite ? "OpenCompany public site" : outcome.deliverable.name;
  let deliverable = isPublicSite
    ? getDeliverableByName(companyId, deliverableName)
    : getDeliverableForTask(companyId, task.id);
  if (isPublicSite && deliverable && deliverable.taskId !== task.id) {
    // Reviews resolve their artifact through the task, so point the canonical
    // deliverable at the pass that just produced the new version.
    attachDeliverableToTask(companyId, deliverable.id, task.id, task.projectId);
  }
  deliverable ??= createDeliverable({
    companyId,
    projectId: task.projectId,
    taskId: task.id,
    name: deliverableName,
    kind: outcome.deliverable.kind,
  });

  const files = new Map(Object.entries(outcome.deliverable.files));
  if (isPublicSite) {
    // An improvement pass may touch one page; keep the last passing site as the
    // base so untouched pages and their links survive.
    const base = listDeliverableVersions(companyId, deliverable.id).find((version) => version.checksPassed);
    if (base) {
      for (const [name, body] of readArtifactFiles(base.artifactPath)) {
        if (!files.has(name)) files.set(name, body);
      }
    }
  }
  if (files.size === 0) throw new Error("Deliverable contains no files.");

  const nextVersion = deliverable.currentVersion + 1;
  const persisted = persistFiles({
    companyId,
    deliverableId: deliverable.id,
    version: nextVersion,
    files,
  });
  const checks = runChecks(files, [...(task.requiredChecks ?? []), ...(outcome.requiredChecks ?? [])]);
  const passed = checksPassed(checks);

  addDeliverableVersion({
    companyId,
    deliverableId: deliverable.id,
    artifactPath: persisted.artifactPath,
    manifest: persisted.manifest,
    entryFile: outcome.deliverable.entryFile,
    notes: outcome.deliverable.notes,
    checks,
    checksPassed: passed,
    createdByEmployeeId: employee.id,
    runId: run.id,
  });

  recordRunEvent({
    companyId,
    runId: run.id,
    taskId: task.id,
    employeeId: employee.id,
    type: "deliverable.created",
    message: `${deliverable.name} v${nextVersion}: ${files.size} files, ${checks.filter((check) => check.passed).length}/${checks.length} checks passed.`,
    payload: { checks, manifest: persisted.manifest },
  });

  if (!passed) {
    const attemptsLeft = task.attemptCount < task.maxAttempts;
    const failing = checks.filter((check) => !check.passed);
    const feedback = failing.map((check) => `- ${check.id}: ${check.detail}`).join("\n");
    updateTask(companyId, task.id, {
      status: attemptsLeft ? "pending" : "blocked",
      blockedReason: attemptsLeft ? null : `Checks failed:\n${feedback}`,
      description: attemptsLeft
        ? `${task.description}\n\nAutomated checks failed on the previous attempt. Fix every item, then call run_checks again:\n${feedback}`
        : task.description,
    });
    recordActivity({
      companyId,
      actorType: "system",
      type: "checks.failed",
      summary: `Checks failed for "${task.title}": ${checks.filter((c) => !c.passed).map((c) => `${c.id} — ${c.detail}`).join("; ")}`,
      taskId: task.id,
      projectId: task.projectId,
    });
    if (!attemptsLeft) result.blocked.push(task.id);
    return;
  }

  const reviewer = reviewEmployeeFor(companyId, employee);
  if (!reviewer) {
    updateTask(companyId, task.id, {
      status: "blocked",
      blockedReason: "No independent reviewer is available in this company.",
    });
    result.blocked.push(task.id);
    return;
  }

  updateTask(companyId, task.id, { status: "awaiting_review" });
  createTask({
    companyId,
    projectId: task.projectId,
    parentTaskId: task.id,
    reviewOfTaskId: task.id,
    title: `Independently review: ${task.title}`,
    description: `Review deliverable "${deliverable.name}" against the acceptance criteria. Do not rewrite it.`,
    kind: "review",
    acceptanceCriteria: task.acceptanceCriteria,
    requiredChecks: [],
    assigneeId: reviewer.id,
    createdById: employee.id,
    delegationDepth: task.delegationDepth + 1,
    // Operator resets re-drive a task at the same round; include the number of
    // reviews already requested so a fresh review does not collide with an old one.
    idempotencyKey: `review:${task.id}:${task.reviewRound}:${listTasks(companyId, task.projectId ? { projectId: task.projectId } : {}).filter((candidate) => candidate.reviewOfTaskId === task.id).length}`,
    status: "pending",
  });
  recordActivity({
    companyId,
    actorType: "system",
    type: "review.requested",
    summary: `${reviewer.name} will independently review "${task.title}".`,
    taskId: task.id,
    projectId: task.projectId,
  });
}

function handleReview(input: {
  companyId: string;
  task: Task;
  employee: Employee;
  outcome: AgentRunResult;
  result: TickResult;
}) {
  const { companyId, task, employee, outcome, result } = input;
  const reviewedId = task.reviewOfTaskId;
  if (!reviewedId) throw new Error("Review task has no subject.");
  const reviewed = getTask(companyId, reviewedId);
  if (!reviewed) throw new Error("Reviewed task no longer exists.");
  const deliverable = getDeliverableForTask(companyId, reviewed.id);
  const version = deliverable ? latestDeliverableVersion(companyId, deliverable.id) : null;
  if (!deliverable || !version) throw new Error("Review found no deliverable to inspect.");

  const verdict = outcome.review;
  if (!verdict) throw new Error("Reviewer returned no verdict. A review must state pass or fail.");

  recordRunEvent({
    companyId,
    taskId: task.id,
    employeeId: employee.id,
    type: "review.verdict",
    message: `${verdict.verdict.toUpperCase()}: ${verdict.findings.join(" | ") || "no findings"}`,
  });

  if (verdict.verdict === "pass") {
    setDeliverableStatus(companyId, deliverable.id, "approved");
    updateTask(companyId, reviewed.id, { status: "completed", blockedReason: null });
    updateTask(companyId, task.id, { status: "completed" });
    result.completed.push(task.id, reviewed.id);
    recordActivity({
      companyId,
      actorType: "employee",
      actorId: employee.id,
      type: "review.passed",
      summary: `${employee.name} approved "${deliverable.name}" v${version.version}.`,
      taskId: reviewed.id,
      projectId: reviewed.projectId,
    });
    if (deliverable.kind === "website") {
      requestDeploymentDecision(companyId, reviewed, deliverable.id, version.version);
    }
    maybeQueueReport(companyId, reviewed.projectId);
    return;
  }

  const round = reviewed.reviewRound + 1;
  updateTask(companyId, task.id, { status: "completed" });
  // No review-round ceiling: revisions continue until the reviewer passes the work.

  updateTask(companyId, reviewed.id, {
    status: "pending",
    reviewRound: round,
    attemptCount: 0,
    blockedReason: null,
    description: `${reviewed.description}\n\nRevision ${round} requested by ${employee.name}: ${verdict.findings.map((finding) => `- ${finding}`).join(" ")}`,
  });
  recordActivity({
    companyId,
    actorType: "employee",
    actorId: employee.id,
    type: "review.revision_requested",
    summary: `${employee.name} requested a revision of "${reviewed.title}": ${verdict.findings.join("; ")}`,
    taskId: reviewed.id,
    projectId: reviewed.projectId,
  });
}

// ---------------------------------------------------------------------------
// Decisions created by the loop
// ---------------------------------------------------------------------------

function requestDeploymentDecision(companyId: string, reviewed: Task, deliverableId: string, version: number) {
  const project = reviewed.projectId ? getProject(companyId, reviewed.projectId) : null;
  const deliverable = getDeliverableForTask(companyId, reviewed.id);
  if (!deliverable) return;
  const manifest = latestDeliverableVersion(companyId, deliverableId)?.manifest ?? [];
  const existing = getDb()
    .prepare(
      "SELECT id FROM decisions WHERE company_id = ? AND project_id = ? AND kind = 'public_deploy' AND status IN ('pending','approved')",
    )
    .get(companyId, reviewed.projectId);
  if (existing) return;

  const target = `${project?.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "customer-site"}.example.test`;

  proposeDecision({
    companyId,
    requestedByEmployeeId: reviewed.assigneeId,
    taskId: reviewed.id,
    projectId: reviewed.projectId,
    kind: "public_deploy",
    title: `Publish "${deliverable.name}" v${version} to ${target}`,
    businessReason:
      "The deliverable passed automated checks and independent review. Publishing makes it publicly reachable, which needs the owner's explicit approval.",
    action: {
      kind: "public_deploy",
      externalKind: "deployment_package",
      projectId: reviewed.projectId,
      deliverableId,
      version,
      target,
      manifest,
      files: manifest.length,
    },
    risk: "high",
  });
  recordActivity({
    companyId,
    actorType: "system",
    type: "deploy.requested",
    summary: `Deployment approval requested for ${deliverable.name} v${version}.`,
    taskId: reviewed.id,
    projectId: reviewed.projectId,
  });
}

function maybeQueueReport(companyId: string, projectId: string | null): void {
  if (!projectId) return;
  const tasks = listTasks(companyId, { projectId });
  const substantive = tasks.filter((candidate) => candidate.kind !== "report");
  const allDone = substantive.length > 0 && substantive.every((candidate) => candidate.status === "completed");
  if (!allDone) return;
  if (tasks.some((candidate) => candidate.kind === "report")) return;
  const project = getProject(companyId, projectId);
  const goal = project?.goalId ? getGoal(companyId, project.goalId) : null;
  const ceo = listEmployees(companyId).find((employee) => /chief executive/i.test(employee.title));
  createTask({
    companyId,
    projectId,
    title: goal ? `CEO operating report: ${goal.title}` : `CEO operating report: ${project?.name}`,
    description:
      "Compile an operating report for the owner: what was delivered, what it cost, what was reviewed, and what still needs a decision.",
    kind: "report",
    acceptanceCriteria: ["Report states deliverables, checks, cost, and open decisions"],
    assigneeId: ceo?.id ?? listEmployees(companyId)[0]?.id ?? null,
    status: "pending",
    priority: 10,
    idempotencyKey: `report:${projectId}`,
  });
  recordActivity({
    companyId,
    actorType: "system",
    type: "report.queued",
    summary: "All project tasks are complete; the CEO is preparing an operating report.",
    projectId,
  });
}

export function finishProjectReport(
  companyId: string,
  task: Task,
  employee: Employee,
  project: Project | null,
  goal: Goal | null,
): string {
  const tasks = task.projectId ? listTasks(companyId, { projectId: task.projectId }) : [];
  const deliverables = listDeliverables(companyId).filter(
    (deliverable) => !task.projectId || deliverable.projectId === task.projectId,
  );
  const budget = budgetSnapshot(companyId, getPolicies(companyId));
  const pendingDecisions = getDb()
    .prepare("SELECT COUNT(*) AS n FROM decisions WHERE company_id = ? AND status = 'pending'")
    .get(companyId) as any;
  const completed = tasks.filter((candidate) => candidate.status === "completed").length;
  const blocked = tasks.filter((candidate) => candidate.status === "blocked" || candidate.status === "awaiting_approval");
  const deployDecision = getDb()
    .prepare(
      "SELECT id, title FROM decisions WHERE company_id = ? AND kind = 'public_deploy' AND status = 'pending' LIMIT 1",
    )
    .get(companyId) as any;

  const lines = [
    `# Operating report — ${goal?.title ?? project?.name ?? "company"}`,
    "",
    `Prepared by ${employee.name}, ${employee.title}. Compiled from recorded company data on ${nowIso().slice(0, 10)}.`,
    "",
    "## What was delivered",
    ...deliverables.map((deliverable) => {
      const version = latestDeliverableVersion(companyId, deliverable.id);
      return `- **${deliverable.name}** v${deliverable.currentVersion}, status ${deliverable.status}. ${version ? `${version.manifest.length} files, checks ${version.checksPassed ? "passed" : "failed"}.` : ""}`;
    }),
    "",
    "## Work performed",
    `- ${completed} of ${tasks.length} tasks complete.`,
    ...tasks
      .filter((candidate) => candidate.kind !== "report")
      .map((candidate) => `  - ${candidate.status === "completed" ? "✓" : "•"} ${candidate.title} — ${candidate.status}`),
    "",
    "## Cost and usage",
    `- Budget limit: ${budget.limitCents}¢ · committed ${budget.committedCents}¢ · remaining ${budget.remainingCents}¢.`,
    `- Recorded provider charges: ${budget.recordedCents + budget.verifiedCents}¢. Estimates are reservations, not invoices.`,
    `- Model tokens recorded: ${budget.modelTokensIn} in / ${budget.modelTokensOut} out.`,
    "",
    "## Open items for the owner",
    ...(blocked.length
      ? blocked.map((candidate) => `- **${candidate.title}** — ${candidate.status}: ${candidate.blockedReason ?? "needs attention"}`)
      : ["- None."]),
    ...(deployDecision
      ? [`- **Deployment approval** — ${deployDecision.title} (${deployDecision.id})`]
      : []),
    ...(Number(pendingDecisions?.n ?? 0) > 0 ? [`- ${pendingDecisions.n} decision(s) pending in the Decisions view.`] : []),
  ];

  const report = createReport({
    companyId,
    goalId: goal?.id ?? null,
    title: `CEO operating report — ${goal?.title ?? project?.name ?? "company"}`,
    bodyMd: lines.join("\n"),
    metrics: {
      tasks: tasks.length,
      completed,
      blocked: blocked.length,
      deliverables: deliverables.length,
      committedCents: budget.committedCents,
      limitCents: budget.limitCents,
      pendingDecisions: Number(pendingDecisions?.n ?? 0),
    },
  });

  updateTask(companyId, task.id, { status: "completed" });
  if (goal) updateGoalStatus(companyId, goal.id, "completed");
  if (project) {
    getDb()
      .prepare("UPDATE projects SET status = 'completed', updated_at = ? WHERE company_id = ? AND id = ?")
      .run(nowIso(), companyId, project.id);
  }
  recordActivity({
    companyId,
    actorType: "employee",
    actorId: employee.id,
    type: "report.published",
    summary: `${employee.name} published an operating report for ${goal?.title ?? project?.name}.`,
    projectId: task.projectId,
    payload: { reportId: report.id },
  });
  return report.id;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export async function workerTick(companyId: string, workerId: string): Promise<TickResult> {
  const result: TickResult = {
    workerId,
    recovered: 0,
    dispatched: [],
    completed: [],
    blocked: [],
    external: [],
    reports: [],
  };
  result.recovered += recoverInterruptedRuns(companyId);
  result.recovered += recoverStaleExternalActions(companyId);
  result.recovered += recoverBlockedTasks(companyId).length;
  result.recovered += dedupeQueuedTasks(companyId).length;
  runDueRoutines(companyId);

  for (const action of approvedExternalActions(companyId).slice(0, 3)) {
    const outcome = await executeExternalAction(companyId, action.id, workerId);
    if (outcome) result.external.push(`${action.kind}:${outcome.status}`);
  }

  let dispatched = 0;
  while (dispatched < 2 && (await dispatchNextTask(companyId, workerId, result))) {
    dispatched += 1;
  }

  // Any completed run proves the provider is answering again.
  if (result.completed.length > 0) clearProviderOutage(companyId);

  const companies = getCompany(companyId);
  if (companies && !companies.haltedAt) {
    for (const task of listTasks(companyId).filter((candidate) => candidate.kind === "work" && candidate.status === "completed")) {
      if (task.projectId) maybeQueueReport(companyId, task.projectId);
    }
  }
  return result;
}

export function companySnapshot(companyId: string) {
  const company = getCompany(companyId);
  const employees = listEmployees(companyId);
  const budget = budgetSnapshot(companyId, getPolicies(companyId));
  return { company, employees, budget };
}

export function noopTickResult(workerId: string): TickResult {
  return { workerId, recovered: 0, dispatched: [], completed: [], blocked: [], external: [], reports: [] };
}

export type { Company };
