import type {
  CheckResult,
  DeliverableVersion,
  Employee,
  Goal,
  KnowledgeDoc,
  Project,
  Task,
} from "@/lib/domain/types";
import type { EmployeeWorkspace } from "@/lib/computers/workspace";

export interface PlanTaskProposal {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  requiredChecks: string[];
  assigneeName: string;
  estimateCents: number;
  /** Indexes into the same array. */
  dependsOn?: number[];
}

export interface PlanProposal {
  projectName: string;
  projectDescription: string;
  summary: string;
  budgetCents: number;
  tasks: PlanTaskProposal[];
}

export interface ReviewVerdict {
  verdict: "pass" | "fail";
  findings: string[];
}

export interface AgentRunInput {
  employee: Employee;
  task: Task;
  project: Project | null;
  goal: Goal | null;
  /** Tasks already created in this project, for planning and context. */
  siblings: Task[];
  knowledge: KnowledgeDoc[];
  workspace: EmployeeWorkspace;
  /** The customer/owner brief, if this task descends from one. */
  brief: string;
  /** Latest artifact of the upstream deliverable, for review tasks. */
  upstream: DeliverableVersion | null;
  /** Employee roster used by planning. */
  roster: { name: string; title: string; department: string | null }[];
  tools: AgentToolkit;
  /** Aborts between tool calls when the run is cancelled or the owner takes over. */
  shouldStop: () => boolean;
  log: (type: string, message: string, payload?: Record<string, unknown>) => void;
}

export interface AgentToolkit {
  readFile(relative: string): string;
  writeFile(relative: string, contents: string): { path: string; bytes: number };
  listFiles(): string[];
  runCommand(command: string, args: string[]): Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    denied?: string;
  }>;
  /** Creating a decision pauses the task and asks the owner. */
  requestDecision(input: {
    kind: string;
    title: string;
    businessReason: string;
    action: Record<string, unknown>;
    risk?: string;
  }): void;
}

export interface AgentRunResult {
  summary: string;
  blocked?: { reason: string };
  deliverable?: {
    name: string;
    kind: string;
    entryFile: string;
    notes: string;
    files: Record<string, string>;
  };
  requiredChecks?: string[];
  plan?: PlanProposal;
  review?: ReviewVerdict;
  checks?: CheckResult[];
  tokensIn?: number;
  tokensOut?: number;
  simulated?: boolean;
}

export interface AgentBackend {
  readonly id: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
