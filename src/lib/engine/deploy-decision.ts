/**
 * Whether a completed pass needs its own publish decision.
 *
 * A standing approval — the owner having pre-approved publishing this class of
 * deliverable — is a decision that keeps standing: the first pass records it, and
 * later passes publish under it instead of asking again and again. A decision the
 * owner made by hand covers exactly the version they looked at, and a pending one
 * still waits for them, so both of those stop the loop from stacking up duplicates.
 */
export type DeployDecisionPlan = "propose" | "reuse" | "wait";

export function planDeployDecision(standing: { status: string } | null): DeployDecisionPlan {
  if (!standing) return "propose";
  if (standing.status === "auto_approved") return "reuse";
  if (standing.status === "pending" || standing.status === "approved") return "wait";
  return "propose";
}
