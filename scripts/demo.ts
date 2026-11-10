/**
 * Deterministic end-to-end demo of the first vertical slice.
 *
 * It seeds the fictional company, submits the owner's brief, then acts as the
 * owner for the approval gate and lets the durable worker loop advance until the
 * report and deployment decision are ready. Everything is real except the agent
 * reasoning (deterministic) and the external deployment (blocked, no provider).
 *
 *   npm run demo
 */
import { closeDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import {
  getCompanyBySlug,
  getOwner,
  listDecisions,
  listDeliverables,
  listReports,
  listTasks,
  latestDeliverableVersion,
} from "../src/lib/domain/repo";
import { submitOwnerBrief } from "../src/lib/domain/commands";
import { approveDecision } from "../src/lib/domain/decisions";
import { workerTick } from "../src/lib/engine/orchestrator";
import { seedCompany } from "./seed";

const live = process.argv.includes("--live");
if (!live) process.env.OPENCOMPANY_AGENT_BACKEND = "deterministic";

const REQUIREMENTS = [
  "Customer: Larkspur & Ledger",
  "Industry: independent bookkeeping studio",
  "Sections: Home, About, Services, Contact",
  "Tone: calm, precise, human",
  "Contact email: hello@larkspur-ledger.test",
  "Primary color: #1f3d34",
  "Accent color: #d8a24a",
  "Notes: Small business owners who want clear numbers and no surprises.",
  "Constraints: static files only; no analytics, trackers or external assets; the contact form must not claim a backend.",
].join("\n");

async function main() {
  const config = getConfig();
  console.log(`\nOpenCompany demo — backend: ${config.agentBackend}${live ? " (live model)" : " (simulated, no model calls)"}`);
  seedCompany();
  const company = getCompanyBySlug(config.companySlug)!;
  const owner = getOwner(company.id);

  const brief = submitOwnerBrief({
    companyId: company.id,
    ownerId: owner.id,
    title: "Prepare a small website for Larkspur & Ledger",
    brief:
      "Prepare a small website for this customer using the attached requirements. Keep it to three pages, run the checks, and bring me the deployment decision before anything is published.",
    requirements: REQUIREMENTS,
    budgetCents: 500,
  });
  console.log(`\n1. Owner (${owner.name}) submitted the brief → goal ${brief.goalId}`);

  const workerId = `demo-${process.pid}`;
  let approved = false;
  let reportSeen = false;
  let deploySeen = false;

  for (let tick = 0; tick < 60; tick += 1) {
    await workerTick(company.id, workerId);

    if (!approved) {
      const plan = listDecisions(company.id, "pending").find((decision) => decision.kind === "plan");
      if (plan) {
        console.log(`\n2. CEO plan awaiting approval: ${plan.title}`);
        console.log(`   ${plan.businessReason}`);
        const result = approveDecision({
          companyId: company.id,
          decisionId: plan.id,
          actor: { type: "human", id: owner.id },
          note: "Demo: approved by the script acting as the owner.",
        });
        console.log(`   Owner decision: ${result.ok ? "approved" : result.reason}`);
        approved = result.ok;
      }
    }

    const report = listReports(company.id)[0];
    if (report && !reportSeen) {
      reportSeen = true;
      console.log(`\n5. CEO operating report published: ${report.title}\n`);
      console.log(report.bodyMd.split("\n").map((line) => `   ${line}`).join("\n"));
    }

    const deploy = listDecisions(company.id, "pending").find((decision) => decision.kind === "public_deploy");
    if (deploy && !deploySeen) {
      deploySeen = true;
      console.log(`\n6. Deployment decision waiting for the owner: ${deploy.title}`);
      console.log("   Nothing was published. Approve it in the Decisions view to see the provider blocker.");
    }

    if (approved && reportSeen && deploySeen) break;
  }

  console.log("\n--- Result ---");
  const tasks = listTasks(company.id);
  for (const task of tasks) {
    console.log(`  ${task.status.padEnd(16)} ${task.kind.padEnd(7)} ${task.title}`);
  }
  for (const deliverable of listDeliverables(company.id)) {
    const version = latestDeliverableVersion(company.id, deliverable.id);
    console.log(
      `  deliverable: ${deliverable.name} v${deliverable.currentVersion} [${deliverable.status}] ` +
        `${version?.manifest.length ?? 0} files, checks ${version?.checksPassed ? "passed" : "failed"}`,
    );
  }
  const deploy = listDecisions(company.id).find((decision) => decision.kind === "public_deploy");
  if (deploy) {
    console.log(`  pending deploy decision: ${deploy.title} (${deploy.status})`);
  }
  console.log(
    "\nOpen http://localhost:3000 and start `npm run worker` to keep the durable loop running.\n",
  );
  closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
