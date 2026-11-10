import { actionHash } from "@/lib/db";
import {
  createDecision,
  createExternalAction,
  getDecision,
  getEmployee,
  getProject,
  listTasks,
  recordActivity,
  updateDecision,
  updateGoalStatus,
  updateTask,
} from "@/lib/domain/repo";
import type { Decision } from "@/lib/domain/types";

export interface DecisionActor {
  type: "human" | "employee" | "system";
  id: string;
}

/** Create a decision bound to the exact action the employee proposed. */
export function proposeDecision(input: {
  companyId: string;
  requestedByEmployeeId: string | null;
  taskId: string | null;
  projectId: string | null;
  kind: string;
  title: string;
  businessReason: string;
  action: Record<string, unknown>;
  risk?: string;
}): Decision {
  const decision = createDecision({
    ...input,
    actionHash: actionHash(input.action),
    risk: input.risk ?? "medium",
  });
  recordActivity({
    companyId: input.companyId,
    actorType: input.requestedByEmployeeId ? "employee" : "system",
    actorId: input.requestedByEmployeeId,
    type: "decision.requested",
    summary: `${input.title} — awaiting the owner`,
    taskId: input.taskId,
    projectId: input.projectId,
    payload: { decisionId: decision.id, kind: input.kind },
  });
  return decision;
}

/**
 * Approve a decision. If the owner submits action details, they must match the
 * exact action that was reviewed; any material change invalidates the approval
 * instead of silently authorising something else.
 */
export function approveDecision(input: {
  companyId: string;
  decisionId: string;
  actor: DecisionActor;
  note?: string;
  submittedAction?: Record<string, unknown>;
}): { ok: boolean; decision: Decision; reason?: string } {
  if (input.actor.type !== "human") {
    return { ok: false, decision: getDecision(input.companyId, input.decisionId)!, reason: "Only a human owner can approve actions." };
  }
  const decision = getDecision(input.companyId, input.decisionId);
  if (!decision) return { ok: false, decision: null as unknown as Decision, reason: "Decision not found." };
  if (decision.status !== "pending") {
    return { ok: false, decision, reason: `Decision is already ${decision.status}.` };
  }
  if (input.submittedAction && actionHash(input.submittedAction) !== decision.actionHash) {
    updateDecision(input.companyId, decision.id, {
      status: "invalidated",
      invalidatedReason: "The proposed action changed after it was requested; approval does not carry over.",
      decidedBy: input.actor.id,
    });
    recordActivity({
      companyId: input.companyId,
      actorType: "system",
      type: "decision.invalidated",
      summary: `Approval invalidated: ${decision.title} changed.`,
      payload: { decisionId: decision.id },
    });
    return {
      ok: false,
      decision: getDecision(input.companyId, decision.id)!,
      reason: "Action details changed. The approval was invalidated; submit a new decision.",
    };
  }

  updateDecision(input.companyId, decision.id, {
    status: "approved",
    decidedBy: input.actor.id,
    resolutionNote: input.note ?? null,
  });
  applyApproval(input.companyId, decision);
  return { ok: true, decision: getDecision(input.companyId, decision.id)! };
}

export function rejectDecision(input: {
  companyId: string;
  decisionId: string;
  actor: DecisionActor;
  note?: string;
}): { ok: boolean; decision: Decision | null; reason?: string } {
  if (input.actor.type !== "human") {
    return { ok: false, decision: null, reason: "Only a human owner can reject actions." };
  }
  const decision = getDecision(input.companyId, input.decisionId);
  if (!decision) return { ok: false, decision: null, reason: "Decision not found." };
  if (decision.status !== "pending") return { ok: false, decision, reason: `Decision is already ${decision.status}.` };

  updateDecision(input.companyId, decision.id, {
    status: "rejected",
    decidedBy: input.actor.id,
    resolutionNote: input.note ?? null,
  });
  const projectId = String(decision.action.projectId ?? decision.projectId ?? "") || null;
  if (decision.kind === "plan" && projectId) {
    for (const task of listTasks(input.companyId, { projectId })) {
      if (task.status === "blocked" || task.status === "pending") {
        updateTask(input.companyId, task.id, { status: "cancelled", blockedReason: "Owner rejected the plan." });
      }
    }
    updateGoalStatus(input.companyId, String(decision.action.goalId ?? ""), "cancelled");
  }
  if (decision.taskId) {
    updateTask(input.companyId, decision.taskId, { status: "cancelled", blockedReason: "Owner rejected the request." });
  }
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actor.id,
    type: "decision.rejected",
    summary: `Owner rejected: ${decision.title}`,
    taskId: decision.taskId,
    payload: { decisionId: decision.id, note: input.note ?? "" },
  });
  return { ok: true, decision: getDecision(input.companyId, decision.id)! };
}

export function requestDecisionRevision(input: {
  companyId: string;
  decisionId: string;
  actor: DecisionActor;
  note: string;
}): { ok: boolean; decision: Decision | null; reason?: string } {
  if (input.actor.type !== "human") return { ok: false, decision: null, reason: "Only the owner can request a revision." };
  const decision = getDecision(input.companyId, input.decisionId);
  if (!decision) return { ok: false, decision: null, reason: "Decision not found." };
  if (decision.status !== "pending") return { ok: false, decision, reason: `Decision is already ${decision.status}.` };
  updateDecision(input.companyId, decision.id, {
    status: "revision_requested",
    decidedBy: input.actor.id,
    resolutionNote: input.note,
  });
  if (decision.taskId) {
    updateTask(input.companyId, decision.taskId, { status: "pending", blockedReason: null });
  }
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actor.id,
    type: "decision.revision_requested",
    summary: `Owner asked for changes: ${decision.title}`,
    payload: { decisionId: decision.id, note: input.note },
  });
  return { ok: true, decision: getDecision(input.companyId, decision.id)! };
}

/** Effects that follow an approval. Kept next to the approval check on purpose. */
function applyApproval(companyId: string, decision: Decision): void {
  recordActivity({
    companyId,
    actorType: "human",
    type: "decision.approved",
    summary: `Owner approved: ${decision.title}`,
    taskId: decision.taskId,
    payload: { decisionId: decision.id },
  });

  if (decision.kind === "plan") {
    const projectId = String(decision.action.projectId ?? "") || null;
    const taskIds = Array.isArray(decision.action.taskIds) ? (decision.action.taskIds as string[]) : [];
    for (const taskId of taskIds) {
      updateTask(companyId, taskId, { status: "pending", blockedReason: null });
    }
    if (decision.taskId) updateTask(companyId, decision.taskId, { status: "completed", blockedReason: null });
    if (projectId) recordActivity({ companyId, actorType: "system", type: "project.approved", summary: "Plan approved; work released to the team.", projectId });
    return;
  }

  if (decision.kind === "public_deploy" || decision.kind === "external_communication" || decision.kind === "spend") {
    const action = decision.action;
    createExternalAction({
      companyId,
      decisionId: decision.id,
      taskId: decision.taskId,
      kind: String(action.externalKind ?? decision.kind),
      target: String(action.target ?? ""),
      payload: action,
      actionHash: decision.actionHash,
      idempotencyKey: `decision:${decision.id}`,
      status: "approved",
    });
    return;
  }

  if (decision.taskId) {
    updateTask(companyId, decision.taskId, { status: "pending", blockedReason: null });
  }
}

/** Who requested this decision, for the audit trail and the UI. */
export function requesterName(companyId: string, decision: Decision): string {
  if (!decision.requestedByEmployeeId) return "System";
  return getEmployee(companyId, decision.requestedByEmployeeId)?.name ?? "Unknown employee";
}

export function decisionProjectName(companyId: string, decision: Decision): string | null {
  const projectId = decision.projectId ?? (String(decision.action.projectId ?? "") || null);
  if (!projectId) return null;
  return getProject(companyId, projectId)?.name ?? null;
}
