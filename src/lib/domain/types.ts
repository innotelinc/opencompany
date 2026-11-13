export type EmployeeAuthority = "observe" | "internal" | "limited_external";
export type EmployeeStatus =
  | "idle"
  | "working"
  | "blocked"
  | "awaiting_approval"
  | "paused"
  | "error";
export type TaskKind = "plan" | "work" | "review" | "report";
export type TaskStatus =
  | "pending"
  | "running"
  | "blocked"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";
export type DecisionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "auto_approved"
  | "invalidated";

export interface Company {
  id: string;
  slug: string;
  name: string;
  mission: string;
  operatingPrinciples: string;
  haltedAt: string | null;
  haltedReason: string | null;
  createdAt: string;
}

export interface HumanMember {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: string;
  authority: string;
}

export interface Department {
  id: string;
  companyId: string;
  name: string;
  charter: string;
}

export interface Employee {
  id: string;
  companyId: string;
  departmentId: string | null;
  managerId: string | null;
  name: string;
  title: string;
  roleInstructions: string;
  backend: string;
  model: string | null;
  status: EmployeeStatus;
  paused: boolean;
  concurrencyLimit: number;
  allowedTools: string[];
  authority: EmployeeAuthority;
  spendLimitCents: number;
  /** Set when the owner fired this employee; the record and its history remain. */
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
  createdBy: string;
  budgetCents: number;
  createdAt: string;
  completedAt: string | null;
}

export interface Project {
  id: string;
  companyId: string;
  goalId: string | null;
  name: string;
  description: string;
  status: string;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  companyId: string;
  projectId: string | null;
  parentTaskId: string | null;
  reviewOfTaskId: string | null;
  title: string;
  description: string;
  kind: TaskKind;
  acceptanceCriteria: string[];
  requiredChecks: string[];
  status: TaskStatus;
  assigneeId: string | null;
  createdById: string | null;
  delegationDepth: number;
  attemptCount: number;
  maxAttempts: number;
  reviewRound: number;
  maxReviewRounds: number;
  priority: number;
  blockedReason: string | null;
  cancelRequested: boolean;
  idempotencyKey: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRun {
  id: string;
  companyId: string;
  taskId: string;
  employeeId: string;
  attempt: number;
  status: RunStatus;
  mode: "live" | "simulated";
  workerId: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  cancelRequested: boolean;
  costEstimateCents: number;
  tokensIn: number;
  tokensOut: number;
}

export interface Computer {
  id: string;
  companyId: string;
  employeeId: string;
  status: string;
  workspacePath: string;
  browserStatus: string;
  browserProfilePath: string | null;
  humanLockBy: string | null;
  humanLockUntil: string | null;
  lastSeenAt: string | null;
}

export interface Deliverable {
  id: string;
  companyId: string;
  projectId: string | null;
  taskId: string | null;
  name: string;
  kind: string;
  currentVersion: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface DeliverableVersion {
  id: string;
  companyId: string;
  deliverableId: string;
  version: number;
  artifactPath: string;
  manifest: DeliverableManifestEntry[];
  entryFile: string;
  notes: string;
  checks: CheckResult[];
  checksPassed: boolean;
  createdByEmployeeId: string | null;
  runId: string | null;
  createdAt: string;
}

export interface CheckResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface Decision {
  id: string;
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
  status: DecisionStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  resolutionNote: string | null;
  invalidatedReason: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  companyId: string;
  employeeId: string | null;
  taskId: string | null;
  runId: string | null;
  kind: string;
  category: string;
  amountCents: number;
  currency: string;
  description: string;
  provider: string | null;
  providerRef: string | null;
  supersededBy: string | null;
  createdAt: string;
}

export interface KnowledgeDoc {
  id: string;
  companyId: string;
  title: string;
  kind: string;
  body: string;
  accessScope: "company" | "department" | "private";
  departmentId: string | null;
  ownerEmployeeId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  companyId: string;
  actorType: "human" | "employee" | "system";
  actorId: string | null;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
}

export interface RunEvent {
  id: string;
  companyId: string;
  runId: string | null;
  taskId: string | null;
  employeeId: string | null;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OperatingReport {
  id: string;
  companyId: string;
  kind: string;
  goalId: string | null;
  title: string;
  bodyMd: string;
  metrics: Record<string, unknown>;
  createdAt: string;
}

export interface ExternalAction {
  id: string;
  companyId: string;
  decisionId: string | null;
  taskId: string | null;
  kind: string;
  target: string;
  payload: Record<string, unknown>;
  actionHash: string;
  idempotencyKey: string;
  status: string;
  attempts: number;
  result: Record<string, unknown> | null;
  claimedBy: string | null;
  claimedAt: string | null;
}

export interface Routine {
  id: string;
  companyId: string;
  name: string;
  instructions: string;
  assigneeId: string | null;
  intervalMinutes: number;
  nextRunAt: string;
  enabled: boolean;
  lastRunAt: string | null;
}
