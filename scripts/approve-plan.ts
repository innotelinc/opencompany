/**
 * Approve the newest pending plan as the owner (operator utility).
 * Used to continue a live slice after inspecting the proposed plan.
 */
import { closeDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import { getCompanyBySlug, getOwner, listDecisions } from "../src/lib/domain/repo";
import { approveDecision } from "../src/lib/domain/decisions";

const company = getCompanyBySlug(getConfig().companySlug);
if (!company) throw new Error("Company not found. Run npm run db:seed first.");
const owner = getOwner(company.id);
const plan = listDecisions(company.id, "pending")
  .filter((decision) => decision.kind === "plan")
  .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
if (!plan) {
  console.log("No pending plan.");
} else {
  const result = approveDecision({
    companyId: company.id,
    decisionId: plan.id,
    actor: { type: "human", id: owner.id },
    note: "Approved by the owner after inspecting the exact proposed plan.",
  });
  console.log(`${result.ok ? "approved" : `not approved: ${result.reason}`} — ${plan.title}`);
}
closeDb();
