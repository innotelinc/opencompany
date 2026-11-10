import { getDb, newId, nowIso, parseJson } from "@/lib/db";
import type {
  ActivityEvent,
  Company,
  Computer,
  Decision,
  DecisionStatus,
  Deliverable,
  DeliverableVersion,
  Department,
  Employee,
  ExternalAction,
  Goal,
  HumanMember,
  KnowledgeDoc,
  LedgerEntry,
  OperatingReport,
  Project,
  Routine,
  RunEvent,
  Task,
  TaskRun,
} from "./types";

const row = <T>(value: unknown): T => value as T;

function mapCompany(r: any): Company {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    mission: r.mission,
    operatingPrinciples: r.operating_principles,
    haltedAt: r.halted_at,
    haltedReason: r.halted_reason,
    createdAt: r.created_at,
  };
}

function mapEmployee(r: any): Employee {
  return {
    id: r.id,
    companyId: r.company_id,
    departmentId: r.department_id,
    managerId: r.manager_id,
    name: r.name,
    title: r.title,
    roleInstructions: r.role_instructions,
    backend: r.backend,
    model: r.model,
    status: r.status,
    paused: r.paused === 1,
    concurrencyLimit: r.concurrency_limit,
    allowedTools: parseJson<string[]>(r.allowed_tools, []),
    authority: r.authority,
    spendLimitCents: r.spend_limit_cents,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapTask(r: any): Task {
  return {
    id: r.id,
    companyId: r.company_id,
    projectId: r.project_id,
    parentTaskId: r.parent_task_id,
    reviewOfTaskId: r.review_of_task_id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    acceptanceCriteria: parseJson<string[]>(r.acceptance_criteria, []),
    requiredChecks: parseJson<string[]>(r.required_checks, []),
    status: r.status,
    assigneeId: r.assignee_id,
    createdById: r.created_by_id,
    delegationDepth: r.delegation_depth,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    reviewRound: r.review_round,
    maxReviewRounds: r.max_review_rounds,
    priority: r.priority,
    blockedReason: r.blocked_reason,
    cancelRequested: r.cancel_requested === 1,
    idempotencyKey: r.idempotency_key,
    dueAt: r.due_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapRun(r: any): TaskRun {
  return {
    id: r.id,
    companyId: r.company_id,
    taskId: r.task_id,
    employeeId: r.employee_id,
    attempt: r.attempt,
    status: r.status,
    mode: r.mode,
    workerId: r.worker_id,
    leaseExpiresAt: r.lease_expires_at,
    heartbeatAt: r.heartbeat_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    summary: r.summary,
    error: r.error,
    cancelRequested: r.cancel_requested === 1,
    costEstimateCents: r.cost_estimate_cents,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
  };
}

function mapProject(r: any): Project {
  return {
    id: r.id,
    companyId: r.company_id,
    goalId: r.goal_id,
    name: r.name,
    description: r.description,
    status: r.status,
    managerId: r.manager_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapGoal(r: any): Goal {
  return {
    id: r.id,
    companyId: r.company_id,
    title: r.title,
    description: r.description,
    status: r.status,
    createdBy: r.created_by,
    budgetCents: r.budget_cents,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

function mapDecision(r: any): Decision {
  return {
    id: r.id,
    companyId: r.company_id,
    requestedByEmployeeId: r.requested_by_employee_id,
    taskId: r.task_id,
    projectId: r.project_id,
    kind: r.kind,
    title: r.title,
    businessReason: r.business_reason,
    action: parseJson<Record<string, unknown>>(r.action_json, {}),
    actionHash: r.action_hash,
    risk: r.risk,
    status: r.status,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    resolutionNote: r.resolution_note,
    invalidatedReason: r.invalidated_reason,
    createdAt: r.created_at,
  };
}

function mapDeliverable(r: any): Deliverable {
  return {
    id: r.id,
    companyId: r.company_id,
    projectId: r.project_id,
    taskId: r.task_id,
    name: r.name,
    kind: r.kind,
    currentVersion: r.current_version,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapDeliverableVersion(r: any): DeliverableVersion {
  return {
    id: r.id,
    companyId: r.company_id,
    deliverableId: r.deliverable_id,
    version: r.version,
    artifactPath: r.artifact_path,
    manifest: parseJson(r.manifest, []),
    entryFile: r.entry_file,
    notes: r.notes,
    checks: parseJson(r.checks, []),
    checksPassed: r.checks_passed === 1,
    createdByEmployeeId: r.created_by_employee_id,
    runId: r.run_id,
    createdAt: r.created_at,
  };
}

function mapComputer(r: any): Computer {
  return {
    id: r.id,
    companyId: r.company_id,
    employeeId: r.employee_id,
    status: r.status,
    workspacePath: r.workspace_path,
    browserStatus: r.browser_status,
    browserProfilePath: r.browser_profile_path,
    humanLockBy: r.human_lock_by,
    humanLockUntil: r.human_lock_until,
    lastSeenAt: r.last_seen_at,
  };
}

function mapKnowledge(r: any): KnowledgeDoc {
  return {
    id: r.id,
    companyId: r.company_id,
    title: r.title,
    kind: r.kind,
    body: r.body,
    accessScope: r.access_scope,
    departmentId: r.department_id,
    ownerEmployeeId: r.owner_employee_id,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Company / people
// ---------------------------------------------------------------------------

export function getCompanyBySlug(slug: string): Company | null {
  const r = getDb().prepare("SELECT * FROM companies WHERE slug = ?").get(slug);
  return r ? mapCompany(r) : null;
}

export function getCompany(id: string): Company | null {
  const r = getDb().prepare("SELECT * FROM companies WHERE id = ?").get(id);
  return r ? mapCompany(r) : null;
}

export function listCompanies(): Company[] {
  return getDb().prepare("SELECT * FROM companies ORDER BY created_at").all().map(mapCompany);
}

export function getOwner(companyId: string): HumanMember {
  const r = getDb()
    .prepare("SELECT * FROM human_members WHERE company_id = ? ORDER BY created_at LIMIT 1")
    .get(companyId);
  if (!r) throw new Error(`No human member for company ${companyId}`);
  return {
    id: row<any>(r).id,
    companyId: row<any>(r).company_id,
    name: row<any>(r).name,
    email: row<any>(r).email,
    role: row<any>(r).role,
    authority: row<any>(r).authority,
  };
}

export function setCompanyHalted(companyId: string, halted: boolean, reason: string): void {
  getDb()
    .prepare("UPDATE companies SET halted_at = ?, halted_reason = ? WHERE id = ?")
    .run(halted ? nowIso() : null, halted ? reason : null, companyId);
}

export function listDepartments(companyId: string): Department[] {
  return getDb()
    .prepare("SELECT * FROM departments WHERE company_id = ? ORDER BY name")
    .all(companyId)
    .map((r: any) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      charter: r.charter,
    }));
}

export function listEmployees(companyId: string): Employee[] {
  return getDb()
    .prepare("SELECT * FROM employees WHERE company_id = ? ORDER BY created_at")
    .all(companyId)
    .map(mapEmployee);
}

export function getEmployee(companyId: string, id: string): Employee | null {
  const r = getDb()
    .prepare("SELECT * FROM employees WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapEmployee(r) : null;
}

export function listDirectReports(companyId: string, managerId: string): Employee[] {
  return getDb()
    .prepare("SELECT * FROM employees WHERE company_id = ? AND manager_id = ?")
    .all(companyId, managerId)
    .map(mapEmployee);
}

export function setEmployeeStatus(companyId: string, employeeId: string, status: string): void {
  getDb()
    .prepare("UPDATE employees SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?")
    .run(status, nowIso(), companyId, employeeId);
}

export function setEmployeePaused(companyId: string, employeeId: string, paused: boolean): void {
  getDb()
    .prepare(
      "UPDATE employees SET paused = ?, status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    )
    .run(paused ? 1 : 0, paused ? "paused" : "idle", nowIso(), companyId, employeeId);
}

export function createEmployee(input: {
  companyId: string;
  departmentId: string | null;
  managerId: string | null;
  name: string;
  title: string;
  roleInstructions: string;
  backend: string;
  model: string | null;
  allowedTools: string[];
  authority: string;
  spendLimitCents: number;
  concurrencyLimit?: number;
}): Employee {
  const id = newId("emp");
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO employees (id, company_id, department_id, manager_id, name, title,
        role_instructions, backend, model, allowed_tools, authority, spend_limit_cents,
        concurrency_limit, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.companyId,
      input.departmentId,
      input.managerId,
      input.name,
      input.title,
      input.roleInstructions,
      input.backend,
      input.model,
      JSON.stringify(input.allowedTools),
      input.authority,
      input.spendLimitCents,
      input.concurrencyLimit ?? 1,
      now,
      now,
    );
  return getEmployee(input.companyId, id)!;
}

// ---------------------------------------------------------------------------
// Goals and projects
// ---------------------------------------------------------------------------

export function createGoal(input: {
  companyId: string;
  title: string;
  description: string;
  createdBy: string;
  budgetCents: number;
}): Goal {
  const id = newId("goal");
  getDb()
    .prepare(
      `INSERT INTO goals (id, company_id, title, description, status, created_by, budget_cents, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(id, input.companyId, input.title, input.description, "active", input.createdBy, input.budgetCents, nowIso());
  return listGoals(input.companyId).find((goal) => goal.id === id)!;
}

export function listGoals(companyId: string): Goal[] {
  return getDb()
    .prepare("SELECT * FROM goals WHERE company_id = ? ORDER BY created_at DESC")
    .all(companyId)
    .map(mapGoal);
}

export function getGoal(companyId: string, id: string): Goal | null {
  const r = getDb().prepare("SELECT * FROM goals WHERE company_id = ? AND id = ?").get(companyId, id);
  return r ? mapGoal(r) : null;
}

export function updateGoalStatus(companyId: string, id: string, status: string): void {
  getDb()
    .prepare("UPDATE goals SET status = ?, completed_at = ? WHERE company_id = ? AND id = ?")
    .run(status, status === "completed" ? nowIso() : null, companyId, id);
}

export function createProject(input: {
  companyId: string;
  goalId: string | null;
  name: string;
  description: string;
  managerId: string | null;
}): Project {
  const id = newId("proj");
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO projects (id, company_id, goal_id, name, description, status, manager_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, input.companyId, input.goalId, input.name, input.description, "active", input.managerId, now, now);
  return getProject(input.companyId, id)!;
}

export function getProject(companyId: string, id: string): Project | null {
  const r = getDb()
    .prepare("SELECT * FROM projects WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapProject(r) : null;
}

export function listProjects(companyId: string): Project[] {
  return getDb()
    .prepare("SELECT * FROM projects WHERE company_id = ? ORDER BY created_at DESC")
    .all(companyId)
    .map(mapProject);
}

export function updateProjectStatus(companyId: string, id: string, status: string): void {
  getDb()
    .prepare("UPDATE projects SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?")
    .run(status, nowIso(), companyId, id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function createTask(input: {
  companyId: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  reviewOfTaskId?: string | null;
  title: string;
  description?: string;
  kind?: string;
  acceptanceCriteria?: string[];
  requiredChecks?: string[];
  assigneeId?: string | null;
  createdById?: string | null;
  delegationDepth?: number;
  maxAttempts?: number;
  maxReviewRounds?: number;
  priority?: number;
  dependencies?: string[];
  status?: string;
  idempotencyKey?: string | null;
}): Task {
  const db = getDb();
  const id = newId("task");
  const now = nowIso();
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO tasks (id, company_id, project_id, parent_task_id, review_of_task_id, title,
        description, kind, acceptance_criteria, required_checks, status, assignee_id, created_by_id,
        delegation_depth, max_attempts, max_review_rounds, priority, idempotency_key, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.companyId,
      input.projectId ?? null,
      input.parentTaskId ?? null,
      input.reviewOfTaskId ?? null,
      input.title,
      input.description ?? "",
      input.kind ?? "work",
      JSON.stringify(input.acceptanceCriteria ?? []),
      JSON.stringify(input.requiredChecks ?? []),
      input.status ?? "pending",
      input.assigneeId ?? null,
      input.createdById ?? null,
      input.delegationDepth ?? 0,
      input.maxAttempts ?? 2,
      input.maxReviewRounds ?? 2,
      input.priority ?? 50,
      input.idempotencyKey ?? null,
      now,
      now,
    );
    for (const dependency of input.dependencies ?? []) {
      db.prepare(
        "INSERT OR IGNORE INTO task_dependencies (company_id, task_id, depends_on_task_id) VALUES (?,?,?)",
      ).run(input.companyId, id, dependency);
    }
  });
  insert();
  return getTask(input.companyId, id)!;
}

export function getTask(companyId: string, id: string): Task | null {
  const r = getDb()
    .prepare("SELECT * FROM tasks WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapTask(r) : null;
}

export function listTasks(companyId: string, filter: { projectId?: string } = {}): Task[] {
  if (filter.projectId) {
    return getDb()
      .prepare(
        "SELECT * FROM tasks WHERE company_id = ? AND project_id = ? ORDER BY priority ASC, created_at ASC",
      )
      .all(companyId, filter.projectId)
      .map(mapTask);
  }
  return getDb()
    .prepare("SELECT * FROM tasks WHERE company_id = ? ORDER BY created_at ASC")
    .all(companyId)
    .map(mapTask);
}

export function listDependencies(companyId: string, taskId: string): string[] {
  return getDb()
    .prepare("SELECT depends_on_task_id FROM task_dependencies WHERE company_id = ? AND task_id = ?")
    .all(companyId, taskId)
    .map((r: any) => r.depends_on_task_id);
}

export function updateTask(companyId: string, id: string, patch: Partial<{
  status: string;
  blockedReason: string | null;
  assigneeId: string | null;
  attemptCount: number;
  reviewRound: number;
  cancelRequested: boolean;
  description: string;
}>): void {
  const db = getDb();
  const current = getTask(companyId, id);
  if (!current) throw new Error(`Task ${id} not found in company ${companyId}`);
  db.prepare(
    `UPDATE tasks SET status = ?, blocked_reason = ?, assignee_id = ?, attempt_count = ?,
       review_round = ?, cancel_requested = ?, description = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
  ).run(
    patch.status ?? current.status,
    patch.blockedReason === undefined ? current.blockedReason : patch.blockedReason,
    patch.assigneeId === undefined ? current.assigneeId : patch.assigneeId,
    patch.attemptCount ?? current.attemptCount,
    patch.reviewRound ?? current.reviewRound,
    (patch.cancelRequested === undefined ? current.cancelRequested : patch.cancelRequested) ? 1 : 0,
    patch.description ?? current.description,
    nowIso(),
    companyId,
    id,
  );
}

/** Tasks whose dependencies are all complete and that are waiting to run. */
export function listReadyTasks(companyId: string): Task[] {
  return getDb()
    .prepare(
      `SELECT t.* FROM tasks t
       WHERE t.company_id = ?
         AND t.status = 'pending'
         AND t.cancel_requested = 0
         AND NOT EXISTS (
           SELECT 1 FROM task_dependencies d
           JOIN tasks dt ON dt.id = d.depends_on_task_id
           WHERE d.task_id = t.id AND dt.status NOT IN ('completed','awaiting_review')
         )
       ORDER BY t.priority ASC, t.created_at ASC`,
    )
    .all(companyId)
    .map(mapTask);
}

export function listBlockedTasks(companyId: string): Task[] {
  return getDb()
    .prepare("SELECT * FROM tasks WHERE company_id = ? AND status IN ('blocked','awaiting_approval')")
    .all(companyId)
    .map(mapTask);
}

export function listChildTasks(companyId: string, parentTaskId: string): Task[] {
  return getDb()
    .prepare("SELECT * FROM tasks WHERE company_id = ? AND parent_task_id = ?")
    .all(companyId, parentTaskId)
    .map(mapTask);
}

export function countActiveRunsForEmployee(companyId: string, employeeId: string): number {
  const r: any = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM task_runs WHERE company_id = ? AND employee_id = ? AND status = 'running'",
    )
    .get(companyId, employeeId);
  return Number(r?.n ?? 0);
}

/** Detect delegation cycles: would adding child under parent loop back? */
export function isDescendant(companyId: string, ancestorId: string, candidateId: string): boolean {
  const db = getDb();
  let cursor: string | null = candidateId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === ancestorId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const r: any = db
      .prepare("SELECT parent_task_id FROM tasks WHERE company_id = ? AND id = ?")
      .get(companyId, cursor);
    cursor = r?.parent_task_id ?? null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * Run attempts are monotonic per task. Review revisions reset the retry counter
 * but must never reuse an attempt number, which is what makes a duplicate run
 * impossible even after a crash.
 */
export function nextRunAttempt(companyId: string, taskId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(MAX(attempt),0) AS n FROM task_runs WHERE company_id = ? AND task_id = ?")
    .get(companyId, taskId) as { n?: number } | undefined;
  return Number(row?.n ?? 0) + 1;
}

export function createRun(input: {
  companyId: string;
  taskId: string;
  employeeId: string;
  attempt: number;
  mode: string;
  costEstimateCents: number;
}): TaskRun {
  const id = newId("run");
  getDb()
    .prepare(
      `INSERT INTO task_runs (id, company_id, task_id, employee_id, attempt, status, mode,
        cost_estimate_cents, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.companyId,
      input.taskId,
      input.employeeId,
      input.attempt,
      "queued",
      input.mode,
      input.costEstimateCents,
      nowIso(),
    );
  return getRun(input.companyId, id)!;
}

export function getRun(companyId: string, id: string): TaskRun | null {
  const r = getDb()
    .prepare("SELECT * FROM task_runs WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapRun(r) : null;
}

export function listRuns(companyId: string, taskId?: string): TaskRun[] {
  if (taskId) {
    return getDb()
      .prepare("SELECT * FROM task_runs WHERE company_id = ? AND task_id = ? ORDER BY attempt")
      .all(companyId, taskId)
      .map(mapRun);
  }
  return getDb()
    .prepare("SELECT * FROM task_runs WHERE company_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(companyId)
    .map(mapRun);
}

export function latestRun(companyId: string, taskId: string): TaskRun | null {
  const r = getDb()
    .prepare("SELECT * FROM task_runs WHERE company_id = ? AND task_id = ? ORDER BY attempt DESC LIMIT 1")
    .get(companyId, taskId);
  return r ? mapRun(r) : null;
}

/**
 * Atomically lease a queued run. Returns null when another worker won the race.
 */
export function claimRun(companyId: string, runId: string, workerId: string, leaseIso: string): boolean {
  const now = nowIso();
  const result = getDb()
    .prepare(
      `UPDATE task_runs
         SET status = 'running', worker_id = ?, lease_expires_at = ?, heartbeat_at = ?, started_at = ?
       WHERE id = ? AND company_id = ? AND status = 'queued'`,
    )
    .run(workerId, leaseIso, now, now, runId, companyId);
  return result.changes === 1;
}

export function heartbeatRun(companyId: string, runId: string, leaseIso: string): void {
  getDb()
    .prepare("UPDATE task_runs SET heartbeat_at = ?, lease_expires_at = ? WHERE company_id = ? AND id = ?")
    .run(nowIso(), leaseIso, companyId, runId);
}

export function finishRun(
  companyId: string,
  runId: string,
  status: string,
  patch: {
    summary?: string;
    error?: string | null;
    tokensIn?: number;
    tokensOut?: number;
  } = {},
): void {
  getDb()
    .prepare(
      `UPDATE task_runs SET status = ?, finished_at = ?, lease_expires_at = NULL,
        summary = ?, error = ?, tokens_in = ?, tokens_out = ?
       WHERE company_id = ? AND id = ?`,
    )
    .run(
      status,
      nowIso(),
      patch.summary ?? null,
      patch.error ?? null,
      patch.tokensIn ?? 0,
      patch.tokensOut ?? 0,
      companyId,
      runId,
    );
}

export function requestRunCancellation(companyId: string, taskId: string): number {
  return getDb()
    .prepare(
      "UPDATE task_runs SET cancel_requested = 1 WHERE company_id = ? AND task_id = ? AND status IN ('queued','running')",
    )
    .run(companyId, taskId).changes;
}

export function isRunCancelled(companyId: string, runId: string): boolean {
  const r: any = getDb()
    .prepare("SELECT cancel_requested FROM task_runs WHERE company_id = ? AND id = ?")
    .get(companyId, runId);
  return r?.cancel_requested === 1;
}

/** Runs whose lease expired: the worker that held them is presumed gone. */
export function listExpiredRuns(companyId: string): TaskRun[] {
  return getDb()
    .prepare(
      "SELECT * FROM task_runs WHERE company_id = ? AND status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?",
    )
    .all(companyId, nowIso())
    .map(mapRun);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function recordActivity(input: {
  companyId: string;
  actorType: "human" | "employee" | "system";
  actorId?: string | null;
  type: string;
  summary: string;
  payload?: Record<string, unknown>;
  taskId?: string | null;
  projectId?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO activity_events (id, company_id, actor_type, actor_id, type, summary, payload, task_id, project_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      newId("evt"),
      input.companyId,
      input.actorType,
      input.actorId ?? null,
      input.type,
      input.summary,
      JSON.stringify(input.payload ?? {}),
      input.taskId ?? null,
      input.projectId ?? null,
      nowIso(),
    );
}

export function listActivity(companyId: string, limit = 60): ActivityEvent[] {
  return getDb()
    .prepare("SELECT * FROM activity_events WHERE company_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(companyId, limit)
    .map((r: any) => ({
      id: r.id,
      companyId: r.company_id,
      actorType: r.actor_type,
      actorId: r.actor_id,
      type: r.type,
      summary: r.summary,
      payload: parseJson(r.payload, {}),
      taskId: r.task_id,
      projectId: r.project_id,
      createdAt: r.created_at,
    }));
}

export function recordRunEvent(input: {
  companyId: string;
  runId?: string | null;
  taskId?: string | null;
  employeeId?: string | null;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
}): void {
  getDb()
    .prepare(
      `INSERT INTO run_events (id, company_id, run_id, task_id, employee_id, type, message, payload, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      newId("rev"),
      input.companyId,
      input.runId ?? null,
      input.taskId ?? null,
      input.employeeId ?? null,
      input.type,
      input.message,
      JSON.stringify(input.payload ?? {}),
      nowIso(),
    );
}

export function listRunEvents(companyId: string, filter: { runId?: string; taskId?: string; limit?: number } = {}): RunEvent[] {
  const limit = filter.limit ?? 200;
  const db = getDb();
  const rows = filter.runId
    ? db
        .prepare("SELECT * FROM run_events WHERE company_id = ? AND run_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(companyId, filter.runId, limit)
    : filter.taskId
      ? db
          .prepare("SELECT * FROM run_events WHERE company_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(companyId, filter.taskId, limit)
      : db
          .prepare("SELECT * FROM run_events WHERE company_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(companyId, limit);
  return rows.map((r: any) => ({
    id: r.id,
    companyId: r.company_id,
    runId: r.run_id,
    taskId: r.task_id,
    employeeId: r.employee_id,
    type: r.type,
    message: r.message,
    payload: parseJson(r.payload, {}),
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Computers
// ---------------------------------------------------------------------------

export function listComputers(companyId: string): Computer[] {
  return getDb()
    .prepare("SELECT * FROM computers WHERE company_id = ? ORDER BY created_at")
    .all(companyId)
    .map(mapComputer);
}

export function getComputerForEmployee(companyId: string, employeeId: string): Computer | null {
  const r = getDb()
    .prepare("SELECT * FROM computers WHERE company_id = ? AND employee_id = ?")
    .get(companyId, employeeId);
  return r ? mapComputer(r) : null;
}

export function upsertComputer(input: {
  companyId: string;
  employeeId: string;
  workspacePath: string;
  browserProfilePath: string;
  browserStatus: string;
}): Computer {
  const existing = getComputerForEmployee(input.companyId, input.employeeId);
  const now = nowIso();
  if (existing) {
    getDb()
      .prepare(
        "UPDATE computers SET workspace_path = ?, browser_profile_path = ?, browser_status = ?, updated_at = ? WHERE id = ?",
      )
      .run(input.workspacePath, input.browserProfilePath, input.browserStatus, now, existing.id);
    return getComputerForEmployee(input.companyId, input.employeeId)!;
  }
  getDb()
    .prepare(
      `INSERT INTO computers (id, company_id, employee_id, status, workspace_path, browser_status,
        browser_profile_path, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      newId("cmp"),
      input.companyId,
      input.employeeId,
      "stopped",
      input.workspacePath,
      input.browserStatus,
      input.browserProfilePath,
      now,
      now,
    );
  return getComputerForEmployee(input.companyId, input.employeeId)!;
}

export function setComputerStatus(companyId: string, employeeId: string, status: string): void {
  getDb()
    .prepare("UPDATE computers SET status = ?, last_seen_at = ?, updated_at = ? WHERE company_id = ? AND employee_id = ?")
    .run(status, nowIso(), nowIso(), companyId, employeeId);
}

export function grantHumanControl(companyId: string, employeeId: string, by: string, untilIso: string): void {
  getDb()
    .prepare(
      "UPDATE computers SET human_lock_by = ?, human_lock_until = ?, updated_at = ? WHERE company_id = ? AND employee_id = ?",
    )
    .run(by, untilIso, nowIso(), companyId, employeeId);
}

export function releaseHumanControl(companyId: string, employeeId: string): void {
  getDb()
    .prepare(
      "UPDATE computers SET human_lock_by = NULL, human_lock_until = NULL, updated_at = ? WHERE company_id = ? AND employee_id = ?",
    )
    .run(nowIso(), companyId, employeeId);
}

export function humanHoldsControl(computer: Computer | null): boolean {
  if (!computer?.humanLockUntil || !computer.humanLockBy) return false;
  return Date.parse(computer.humanLockUntil) > Date.now();
}

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

export function createDeliverable(input: {
  companyId: string;
  projectId: string | null;
  taskId: string | null;
  name: string;
  kind: string;
}): Deliverable {
  const id = newId("dlv");
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO deliverables (id, company_id, project_id, task_id, name, kind, current_version, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, input.companyId, input.projectId, input.taskId, input.name, input.kind, 0, "draft", now, now);
  return getDeliverable(input.companyId, id)!;
}

export function getDeliverable(companyId: string, id: string): Deliverable | null {
  const r = getDb()
    .prepare("SELECT * FROM deliverables WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapDeliverable(r) : null;
}

export function getDeliverableForTask(companyId: string, taskId: string): Deliverable | null {
  const r = getDb()
    .prepare("SELECT * FROM deliverables WHERE company_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(companyId, taskId);
  return r ? mapDeliverable(r) : null;
}

export function listDeliverables(companyId: string): Deliverable[] {
  return getDb()
    .prepare("SELECT * FROM deliverables WHERE company_id = ? ORDER BY created_at DESC")
    .all(companyId)
    .map(mapDeliverable);
}

export function attachDeliverableToTask(
  companyId: string,
  id: string,
  taskId: string,
  projectId: string | null,
): void {
  getDb()
    .prepare("UPDATE deliverables SET task_id = ?, project_id = ?, updated_at = ? WHERE company_id = ? AND id = ?")
    .run(taskId, projectId, nowIso(), companyId, id);
}

export function setDeliverableStatus(companyId: string, id: string, status: string): void {
  getDb()
    .prepare("UPDATE deliverables SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?")
    .run(status, nowIso(), companyId, id);
}

export function addDeliverableVersion(input: {
  companyId: string;
  deliverableId: string;
  artifactPath: string;
  manifest: unknown;
  entryFile: string;
  notes: string;
  checks: unknown;
  checksPassed: boolean;
  createdByEmployeeId: string;
  runId: string;
}): DeliverableVersion {
  const db = getDb();
  const deliverable = getDeliverable(input.companyId, input.deliverableId);
  if (!deliverable) throw new Error("Deliverable not found");
  const version = deliverable.currentVersion + 1;
  const id = newId("dlvv");
  const apply = db.transaction(() => {
    db.prepare(
      `INSERT INTO deliverable_versions (id, company_id, deliverable_id, version, artifact_path, manifest,
        entry_file, notes, checks, checks_passed, created_by_employee_id, run_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.companyId,
      input.deliverableId,
      version,
      input.artifactPath,
      JSON.stringify(input.manifest),
      input.entryFile,
      input.notes,
      JSON.stringify(input.checks),
      input.checksPassed ? 1 : 0,
      input.createdByEmployeeId,
      input.runId,
      nowIso(),
    );
    db.prepare(
      "UPDATE deliverables SET current_version = ?, status = ?, updated_at = ? WHERE id = ? AND company_id = ?",
    ).run(version, input.checksPassed ? "ready_for_review" : "checks_failed", nowIso(), input.deliverableId, input.companyId);
  });
  apply();
  return getDeliverableVersion(input.companyId, id)!;
}

export function getDeliverableVersion(companyId: string, id: string): DeliverableVersion | null {
  const r = getDb()
    .prepare("SELECT * FROM deliverable_versions WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapDeliverableVersion(r) : null;
}

export function latestDeliverableVersion(companyId: string, deliverableId: string): DeliverableVersion | null {
  const r = getDb()
    .prepare(
      "SELECT * FROM deliverable_versions WHERE company_id = ? AND deliverable_id = ? ORDER BY version DESC LIMIT 1",
    )
    .get(companyId, deliverableId);
  return r ? mapDeliverableVersion(r) : null;
}

export function getDeliverableByName(companyId: string, name: string): Deliverable | null {
  const r = getDb()
    .prepare("SELECT * FROM deliverables WHERE company_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1")
    .get(companyId, name);
  return r ? mapDeliverable(r) : null;
}

export function listDeliverableVersions(companyId: string, deliverableId: string): DeliverableVersion[] {
  return getDb()
    .prepare(
      "SELECT * FROM deliverable_versions WHERE company_id = ? AND deliverable_id = ? ORDER BY version DESC",
    )
    .all(companyId, deliverableId)
    .map(mapDeliverableVersion);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function createDecision(input: {
  companyId: string;
  requestedByEmployeeId: string | null;
  taskId: string | null;
  projectId: string | null;
  kind: string;
  title: string;
  businessReason: string;
  action: Record<string, unknown>;
  actionHash: string;
  risk: string;
  status?: DecisionStatus;
}): Decision {
  const id = newId("dec");
  getDb()
    .prepare(
      `INSERT INTO decisions (id, company_id, requested_by_employee_id, task_id, project_id, kind, title,
        business_reason, action_json, action_hash, risk, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.companyId,
      input.requestedByEmployeeId,
      input.taskId,
      input.projectId,
      input.kind,
      input.title,
      input.businessReason,
      JSON.stringify(input.action),
      input.actionHash,
      input.risk,
      input.status ?? "pending",
      nowIso(),
    );
  return getDecision(input.companyId, id)!;
}

export function getDecision(companyId: string, id: string): Decision | null {
  const r = getDb()
    .prepare("SELECT * FROM decisions WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapDecision(r) : null;
}

export function listDecisions(companyId: string, status?: string): Decision[] {
  const db = getDb();
  return (status
    ? db
        .prepare("SELECT * FROM decisions WHERE company_id = ? AND status = ? ORDER BY created_at DESC")
        .all(companyId, status)
    : db.prepare("SELECT * FROM decisions WHERE company_id = ? ORDER BY created_at DESC").all(companyId)
  ).map(mapDecision);
}

export function updateDecision(
  companyId: string,
  id: string,
  patch: {
    status: string;
    decidedBy?: string | null;
    resolutionNote?: string | null;
    invalidatedReason?: string | null;
  },
): void {
  getDb()
    .prepare(
      `UPDATE decisions SET status = ?, decided_by = ?, decided_at = ?, resolution_note = ?, invalidated_reason = ?
       WHERE company_id = ? AND id = ?`,
    )
    .run(
      patch.status,
      patch.decidedBy ?? null,
      nowIso(),
      patch.resolutionNote ?? null,
      patch.invalidatedReason ?? null,
      companyId,
      id,
    );
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export function addLedgerEntry(input: {
  companyId: string;
  employeeId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  kind: string;
  category: string;
  amountCents: number;
  description: string;
  provider?: string | null;
  providerRef?: string | null;
}): LedgerEntry {
  const id = newId("led");
  getDb()
    .prepare(
      `INSERT INTO ledger_entries (id, company_id, employee_id, task_id, run_id, kind, category,
        amount_cents, currency, description, provider, provider_ref, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.companyId,
      input.employeeId ?? null,
      input.taskId ?? null,
      input.runId ?? null,
      input.kind,
      input.category,
      input.amountCents,
      "USD",
      input.description,
      input.provider ?? null,
      input.providerRef ?? null,
      nowIso(),
    );
  const stored: any = getDb().prepare("SELECT * FROM ledger_entries WHERE id = ?").get(id);
  return {
    id: stored.id,
    companyId: stored.company_id,
    employeeId: stored.employee_id,
    taskId: stored.task_id,
    runId: stored.run_id,
    kind: stored.kind,
    category: stored.category,
    amountCents: stored.amount_cents,
    currency: stored.currency,
    description: stored.description,
    provider: stored.provider,
    providerRef: stored.provider_ref,
    supersededBy: stored.superseded_by,
    createdAt: stored.created_at,
  };
}

export function supersedeLedgerEntry(companyId: string, entryId: string, supersededBy: string): void {
  getDb()
    .prepare("UPDATE ledger_entries SET superseded_by = ? WHERE company_id = ? AND id = ?")
    .run(supersededBy, companyId, entryId);
}

export function listLedger(companyId: string, limit = 200): LedgerEntry[] {
  return getDb()
    .prepare(
      "SELECT * FROM ledger_entries WHERE company_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(companyId, limit)
    .map((r: any) => ({
      id: r.id,
      companyId: r.company_id,
      employeeId: r.employee_id,
      taskId: r.task_id,
      runId: r.run_id,
      kind: r.kind,
      category: r.category,
      amountCents: r.amount_cents,
      currency: r.currency,
      description: r.description,
      provider: r.provider,
      providerRef: r.provider_ref,
      supersededBy: r.superseded_by,
      createdAt: r.created_at,
    }));
}

export function listLedgerForRun(companyId: string, runId: string): LedgerEntry[] {
  return getDb()
    .prepare("SELECT * FROM ledger_entries WHERE company_id = ? AND run_id = ? ORDER BY created_at")
    .all(companyId, runId)
    .map((r: any) => ({
      id: r.id,
      companyId: r.company_id,
      employeeId: r.employee_id,
      taskId: r.task_id,
      runId: r.run_id,
      kind: r.kind,
      category: r.category,
      amountCents: r.amount_cents,
      currency: r.currency,
      description: r.description,
      provider: r.provider,
      providerRef: r.provider_ref,
      supersededBy: r.superseded_by,
      createdAt: r.created_at,
    }));
}

export function ledgerTotals(companyId: string): {
  estimatedCents: number;
  recordedCents: number;
  verifiedCents: number;
  revenueCents: number;
  expenseCents: number;
  modelTokensIn: number;
  modelTokensOut: number;
} {
  const db = getDb();
  const sum = (kind: string) => {
    const r: any = db
      .prepare(
        "SELECT COALESCE(SUM(amount_cents),0) AS total FROM ledger_entries WHERE company_id = ? AND kind = ? AND superseded_by IS NULL",
      )
      .get(companyId, kind);
    return Number(r?.total ?? 0);
  };
  const tokens = db
    .prepare(
      "SELECT COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout FROM task_runs WHERE company_id = ?",
    )
    .get(companyId) as any;
  return {
    estimatedCents: sum("estimated"),
    recordedCents: sum("recorded"),
    verifiedCents: sum("verified_charge"),
    revenueCents: sum("revenue"),
    expenseCents: sum("expense"),
    modelTokensIn: Number(tokens?.tin ?? 0),
    modelTokensOut: Number(tokens?.tout ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export function getPolicies(companyId: string): Record<string, unknown> {
  const rows = getDb().prepare("SELECT key, value FROM policies WHERE company_id = ?").all(companyId);
  const out: Record<string, unknown> = {};
  for (const r of rows as any[]) out[r.key] = parseJson(r.value, null);
  return out;
}

export function setPolicy(companyId: string, key: string, value: unknown, description = ""): void {
  getDb()
    .prepare(
      `INSERT INTO policies (company_id, key, value, description, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(company_id, key) DO UPDATE SET value = excluded.value, description = excluded.description, updated_at = excluded.updated_at`,
    )
    .run(companyId, key, JSON.stringify(value), description, nowIso());
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export function createKnowledgeDoc(input: {
  companyId: string;
  title: string;
  kind?: string;
  body: string;
  accessScope?: "company" | "department" | "private";
  departmentId?: string | null;
  ownerEmployeeId?: string | null;
}): KnowledgeDoc {
  const id = newId("knw");
  const now = nowIso();
  const scope = input.accessScope ?? "company";
  getDb()
    .prepare(
      `INSERT INTO knowledge_docs (id, company_id, title, kind, body, access_scope, department_id,
        owner_employee_id, version, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.companyId,
      input.title,
      input.kind ?? "document",
      input.body,
      scope,
      input.departmentId ?? null,
      input.ownerEmployeeId ?? null,
      1,
      now,
      now,
    );
  getDb()
    .prepare(
      `INSERT INTO knowledge_doc_versions (id, company_id, doc_id, version, body, edited_by, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(newId("knv"), input.companyId, id, 1, input.body, input.ownerEmployeeId ?? "system", now);
  return getKnowledgeDoc(input.companyId, id)!;
}

export function getKnowledgeDoc(companyId: string, id: string): KnowledgeDoc | null {
  const r = getDb()
    .prepare("SELECT * FROM knowledge_docs WHERE company_id = ? AND id = ?")
    .get(companyId, id);
  return r ? mapKnowledge(r) : null;
}

export function listKnowledge(companyId: string): KnowledgeDoc[] {
  return getDb()
    .prepare("SELECT * FROM knowledge_docs WHERE company_id = ? ORDER BY updated_at DESC")
    .all(companyId)
    .map(mapKnowledge);
}

export function updateKnowledgeDoc(companyId: string, id: string, body: string, editedBy: string): void {
  const db = getDb();
  const doc = getKnowledgeDoc(companyId, id);
  if (!doc) throw new Error("Knowledge document not found");
  const version = doc.version + 1;
  const apply = db.transaction(() => {
    db.prepare("UPDATE knowledge_docs SET body = ?, version = ?, updated_at = ? WHERE id = ? AND company_id = ?")
      .run(body, version, nowIso(), id, companyId);
    db.prepare(
      "INSERT INTO knowledge_doc_versions (id, company_id, doc_id, version, body, edited_by, created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(newId("knv"), companyId, id, version, body, editedBy, nowIso());
  });
  apply();
}

/**
 * Server-side knowledge access rule. Employees see company-wide documents, their
 * own department's documents and documents they own. Nothing else.
 */
export function listKnowledgeForEmployee(companyId: string, employee: Employee): KnowledgeDoc[] {
  return listKnowledge(companyId).filter((doc) => {
    if (doc.accessScope === "company") return true;
    if (doc.accessScope === "department") return doc.departmentId === employee.departmentId;
    return doc.ownerEmployeeId === employee.id;
  });
}

export function canEmployeeReadDoc(employee: Employee, doc: KnowledgeDoc): boolean {
  if (doc.accessScope === "company") return true;
  if (doc.accessScope === "department") return doc.departmentId === employee.departmentId;
  return doc.ownerEmployeeId === employee.id;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function createReport(input: {
  companyId: string;
  goalId: string | null;
  kind?: string;
  title: string;
  bodyMd: string;
  metrics: Record<string, unknown>;
}): OperatingReport {
  const id = newId("rep");
  getDb()
    .prepare(
      "INSERT INTO reports (id, company_id, kind, goal_id, title, body_md, metrics, created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      input.companyId,
      input.kind ?? "ceo_operating",
      input.goalId,
      input.title,
      input.bodyMd,
      JSON.stringify(input.metrics),
      nowIso(),
    );
  return getReport(input.companyId, id)!;
}

export function getReport(companyId: string, id: string): OperatingReport | null {
  const r = getDb().prepare("SELECT * FROM reports WHERE company_id = ? AND id = ?").get(companyId, id);
  if (!r) return null;
  const x = r as any;
  return {
    id: x.id,
    companyId: x.company_id,
    kind: x.kind,
    goalId: x.goal_id,
    title: x.title,
    bodyMd: x.body_md,
    metrics: parseJson(x.metrics, {}),
    createdAt: x.created_at,
  };
}

export function listReports(companyId: string): OperatingReport[] {
  return getDb()
    .prepare("SELECT * FROM reports WHERE company_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(companyId)
    .map((x: any) => ({
      id: x.id,
      companyId: x.company_id,
      kind: x.kind,
      goalId: x.goal_id,
      title: x.title,
      bodyMd: x.body_md,
      metrics: parseJson(x.metrics, {}),
      createdAt: x.created_at,
    }));
}

// ---------------------------------------------------------------------------
// External actions
// ---------------------------------------------------------------------------

export function createExternalAction(input: {
  companyId: string;
  decisionId: string | null;
  taskId: string | null;
  kind: string;
  target: string;
  payload: Record<string, unknown>;
  actionHash: string;
  idempotencyKey: string;
  /** 'approved' only when an owner decision authorised this exact action. */
  status?: string;
}): ExternalAction {
  const id = newId("ext");
  const now = nowIso();
  try {
    getDb()
      .prepare(
        `INSERT INTO external_actions (id, company_id, decision_id, task_id, kind, target, payload,
          action_hash, idempotency_key, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.companyId,
        input.decisionId,
        input.taskId,
        input.kind,
        input.target,
        JSON.stringify(input.payload),
        input.actionHash,
        input.idempotencyKey,
        input.status ?? "proposed",
        now,
        now,
      );
  } catch {
    // Unique (company_id, idempotency_key): reuse the existing row.
  }
  const r: any = getDb()
    .prepare("SELECT * FROM external_actions WHERE company_id = ? AND idempotency_key = ?")
    .get(input.companyId, input.idempotencyKey);
  return mapExternalAction(r);
}

export function mapExternalAction(r: any): ExternalAction {
  return {
    id: r.id,
    companyId: r.company_id,
    decisionId: r.decision_id,
    taskId: r.task_id,
    kind: r.kind,
    target: r.target,
    payload: parseJson(r.payload, {}),
    actionHash: r.action_hash,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    attempts: r.attempts,
    result: r.result ? parseJson(r.result, {}) : null,
    claimedBy: r.claimed_by,
    claimedAt: r.claimed_at,
  };
}

export function getExternalAction(companyId: string, id: string): ExternalAction | null {
  const r = getDb().prepare("SELECT * FROM external_actions WHERE company_id = ? AND id = ?").get(companyId, id);
  return r ? mapExternalAction(r) : null;
}

export function listExternalActions(companyId: string): ExternalAction[] {
  return getDb()
    .prepare("SELECT * FROM external_actions WHERE company_id = ? ORDER BY created_at DESC")
    .all(companyId)
    .map(mapExternalAction);
}

/** Atomically claim an approved external action. */
export function claimExternalAction(companyId: string, id: string, workerId: string): boolean {
  const r = getDb()
    .prepare(
      "UPDATE external_actions SET status = 'executing', claimed_by = ?, claimed_at = ?, attempts = attempts + 1, updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('approved')",
    )
    .run(workerId, nowIso(), nowIso(), companyId, id);
  return r.changes === 1;
}

export function finishExternalAction(
  companyId: string,
  id: string,
  status: string,
  result: Record<string, unknown>,
): void {
  getDb()
    .prepare("UPDATE external_actions SET status = ?, result = ?, updated_at = ? WHERE company_id = ? AND id = ?")
    .run(status, JSON.stringify(result), nowIso(), companyId, id);
}

// ---------------------------------------------------------------------------
// Routines and leases
// ---------------------------------------------------------------------------

export function listRoutines(companyId: string): Routine[] {
  return getDb()
    .prepare("SELECT * FROM routines WHERE company_id = ? ORDER BY created_at")
    .all(companyId)
    .map((r: any) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      instructions: r.instructions,
      assigneeId: r.assignee_id,
      intervalMinutes: r.interval_minutes,
      nextRunAt: r.next_run_at,
      enabled: r.enabled === 1,
      lastRunAt: r.last_run_at,
    }));
}

export function createRoutine(input: {
  companyId: string;
  name: string;
  instructions: string;
  assigneeId: string | null;
  intervalMinutes: number;
  nextRunAt: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO routines (id, company_id, name, instructions, assignee_id, interval_minutes, next_run_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(newId("rtn"), input.companyId, input.name, input.instructions, input.assigneeId, input.intervalMinutes, input.nextRunAt, nowIso());
}

export function updateRoutineAfterRun(companyId: string, id: string, nextRunAt: string): void {
  getDb()
    .prepare("UPDATE routines SET last_run_at = ?, next_run_at = ? WHERE company_id = ? AND id = ?")
    .run(nowIso(), nextRunAt, companyId, id);
}

export function acquireLease(name: string, owner: string, seconds: number): boolean {
  const now = nowIso();
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO leases (name, owner, expires_at, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at, updated_at = excluded.updated_at
       WHERE leases.expires_at < ? OR leases.owner = ?`,
    )
    .run(name, owner, expires, now, now, owner);
  return result.changes === 1;
}
