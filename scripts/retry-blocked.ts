/**
 * Retry the newest blocked work task once, as the owner (operator utility).
 * Used after improving a prompt or fixing an input; the task re-runs its checks.
 */
import { closeDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import { getCompanyBySlug, getOwner, listTasks } from "../src/lib/domain/repo";
import { retryTask } from "../src/lib/domain/commands";

const company = getCompanyBySlug(getConfig().companySlug);
if (!company) throw new Error("Company not found. Run npm run db:seed first.");
const owner = getOwner(company.id);
const blocked = listTasks(company.id)
  .filter((task) => task.status === "blocked")
  .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
if (!blocked) {
  console.log("No blocked task.");
} else {
  retryTask({ companyId: company.id, taskId: blocked.id, actorId: owner.id });
  console.log(`retried: ${blocked.title} (${blocked.blockedReason ?? "no reason recorded"})`);
}
closeDb();
