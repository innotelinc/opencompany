import { closeDb, getDb, nowIso } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { listCompanies } from "@/lib/domain/repo";
import { workerTick } from "@/lib/engine/orchestrator";

/**
 * Durable background worker. Runs outside the browser and outside Next.js:
 * closing the app does not stop authorized work. Leases in SQLite make a
 * crashed worker's work recoverable without re-running its side effects.
 */

const workerId = `worker-${process.pid}-${Date.now().toString(36)}`;
const once = process.argv.includes("--once");
let stopping = false;

function heartbeat() {
  const db = getDb();
  const now = nowIso();
  const expires = new Date(Date.now() + 60_000).toISOString();
  db.prepare(
    `INSERT INTO leases (name, owner, expires_at, updated_at) VALUES ('worker', ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
  ).run(workerId, expires, now);
}

function log(message: string) {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

async function tickOnce(): Promise<boolean> {
  const companies = listCompanies();
  let didWork = false;
  for (const company of companies) {
    if (stopping) break;
    try {
      const result = await workerTick(company.id, workerId);
      const interesting =
        result.dispatched.length || result.recovered || result.external.length || result.reports.length || result.blocked.length;
      if (interesting) {
        log(
          JSON.stringify({
            company: company.slug,
            recovered: result.recovered,
            dispatched: result.dispatched.length,
            completed: result.completed.length,
            blocked: result.blocked.length,
            external: result.external,
            reports: result.reports.length,
            ...(result.budgetExhausted ? { budget: result.budgetExhausted } : {}),
          }),
        );
      }
      didWork = didWork || Boolean(result.dispatched.length);
    } catch (error) {
      log(`tick failed for ${company.slug}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
  }
  return didWork;
}

async function main() {
  heartbeat();
  getDb();
  log(
    `started ${workerId} (poll ${getConfig().limits.workerPollMs}ms, backend ${getConfig().agentBackend}, ` +
      `model ${getConfig().model}, fallbacks ${getConfig().modelFallbacks.join(", ") || "none"})`,
  );

  if (once) {
    await tickOnce();
    closeDb();
    return;
  }

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received; finishing the current tick and exiting.`);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (!stopping) {
    heartbeat();
    await tickOnce();
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, getConfig().limits.workerPollMs));
  }
  closeDb();
  log("stopped.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
