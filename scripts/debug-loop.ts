/**
 * Diagnostic helper: prints the operating loop state after every tick.
 * Not part of the product surface.
 */
import { closeDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import {
  getCompanyBySlug,
  getOwner,
  listDecisions,
  listReports,
  listRuns,
  listTasks,
} from "../src/lib/domain/repo";
import { submitOwnerBrief } from "../src/lib/domain/commands";
import { approveDecision } from "../src/lib/domain/decisions";
import { workerTick } from "../src/lib/engine/orchestrator";
import { seedCompany } from "./seed";

process.env.OPENCOMPANY_AGENT_BACKEND = "deterministic";

async function main() {
  seedCompany({ reset: true });
  const company = getCompanyBySlug(getConfig().companySlug)!;
  const owner = getOwner(company.id);
  submitOwnerBrief({
    companyId: company.id,
    ownerId: owner.id,
    title: "Prepare a small website for Larkspur & Ledger",
    brief: "Prepare a small website for this customer using the attached requirements.",
    requirements: [
      "Customer: Larkspur & Ledger",
      "Industry: independent bookkeeping studio",
      "Sections: Home, About, Services, Contact",
      "Tone: calm, precise, human",
      "Contact email: hello@larkspur-ledger.test",
      "Notes: Small business owners who want clear numbers and no surprises.",
    ].join("\n"),
    budgetCents: 500,
  });

  for (let tick = 1; tick <= 20; tick += 1) {
    const result = await workerTick(company.id, "debug-worker");
    const plan = listDecisions(company.id, "pending").find((decision) => decision.kind === "plan");
    if (plan) {
      const approved = approveDecision({
        companyId: company.id,
        decisionId: plan.id,
        actor: { type: "human", id: owner.id },
      });
      console.log(`tick ${tick}: approved plan = ${approved.ok} ${approved.reason ?? ""}`);
    }
    const tasks = listTasks(company.id);
    console.log(
      `tick ${tick}: dispatched=${result.dispatched.length} completed=${result.completed.length} blocked=${result.blocked.length}` +
        ` budget=${result.budgetExhausted ?? "ok"}`,
    );
    for (const task of tasks) {
      console.log(`   ${task.kind.padEnd(6)} ${task.status.padEnd(18)} ${task.title.slice(0, 62)}`);
    }
    const runs = listRuns(company.id);
    for (const run of runs.filter((candidate) => candidate.status !== "succeeded")) {
      console.log(`   run ${run.status} attempt=${run.attempt} error=${(run.error ?? "").slice(0, 100)}`);
    }
    if (listReports(company.id).length > 0) {
      console.log("report published");
      break;
    }
  }
  console.log("pending decisions:", listDecisions(company.id, "pending").map((decision) => decision.kind));
  closeDb();
}

main().catch((error) => {
  console.error(error);
  closeDb();
  process.exitCode = 1;
});
