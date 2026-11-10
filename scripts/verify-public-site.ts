/**
 * Verify the standing public-site loop with the deterministic backend.
 *
 * Seeds the company (idempotent), makes the improvement routine due now, runs
 * the durable loop until the public site deliverable has a passing version, and
 * prints the result. No model calls, no external effects.
 */
import { closeDb, getDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import { getCompanyBySlug, listDeliverables, latestDeliverableVersion } from "../src/lib/domain/repo";
import { workerTick } from "../src/lib/engine/orchestrator";
import { seedCompany } from "./seed";

process.env.OPENCOMPANY_AGENT_BACKEND = "deterministic";

async function main() {
  const companyId = seedCompany();
  // Schedule from now, not the epoch: routine tasks carry a time-based
  // idempotency key, so a fixed past timestamp would collide on every tick.
  getDb()
    .prepare("UPDATE routines SET next_run_at = ? WHERE company_id = ?")
    .run(new Date().toISOString(), companyId);
  const workerId = `public-site-check-${process.pid}`;
  for (let tick = 0; tick < 20; tick += 1) {
    await workerTick(companyId, workerId);
    const deliverable = listDeliverables(companyId).find((item) => item.name === "OpenCompany public site");
    const version = deliverable ? latestDeliverableVersion(companyId, deliverable.id) : null;
    if (version?.checksPassed) break;
  }
  const deliverable = listDeliverables(companyId).find((item) => item.name === "OpenCompany public site");
  const version = deliverable ? latestDeliverableVersion(companyId, deliverable.id) : null;
  console.log(
    version
      ? `public site v${version.version}: ${version.manifest.length} files, checks ${version.checksPassed ? "passed" : "FAILED"}`
      : "public site: no deliverable produced",
  );
  if (version) console.log(version.manifest.map((file) => file.path).join(", "));
  console.log(`company: ${getCompanyBySlug(getConfig().companySlug)?.name}`);
  closeDb();
  if (!version?.checksPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
