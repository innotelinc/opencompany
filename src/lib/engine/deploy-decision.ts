/**
 * Where a completed pass's deliverable goes.
 *
 * The company's own site is served by this application at `/site`, so a new version
 * that passed its checks is already live: there is nothing to approve and nothing to
 * deploy. A customer deliverable still needs a publish decision — once per deliverable
 * when a standing approval covers it, and otherwise once per version the owner sees.
 */
export type DeployDecisionPlan = "served" | "propose" | "reuse" | "wait";

export function planDeployDecision(input: {
  servedByThisApp: boolean;
  standing: { status: string } | null;
}): DeployDecisionPlan {
  if (input.servedByThisApp) return "served";
  if (!input.standing) return "propose";
  if (input.standing.status === "auto_approved") return "reuse";
  if (input.standing.status === "pending" || input.standing.status === "approved") return "wait";
  return "propose";
}
