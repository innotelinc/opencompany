/**
 * Resets the demo database in place.
 *
 * It truncates tables rather than deleting the SQLite file so a stale reader on
 * Windows cannot block the reset with EPERM. Stop the web app and worker first
 * for a completely clean wipe of `.data` (workspaces, artifacts, previews).
 */
import fs from "node:fs";
import { closeDb, getDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import { seedCompany } from "./seed";

const TABLES = [
  "run_events",
  "task_runs",
  "task_dependencies",
  "deliverable_versions",
  "deliverables",
  "external_actions",
  "decisions",
  "ledger_entries",
  "activity_events",
  "reports",
  "routines",
  "knowledge_doc_versions",
  "knowledge_docs",
  "policies",
  "computers",
  "tasks",
  "projects",
  "goals",
  "employees",
  "departments",
  "human_members",
  "companies",
];

const db = getDb();
db.exec("PRAGMA foreign_keys = OFF");
for (const table of TABLES) {
  try {
    db.prepare(`DELETE FROM ${table}`).run();
  } catch (error) {
    console.warn(`skip ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
db.exec("PRAGMA foreign_keys = ON");
console.log("Cleared all company data.");

const config = getConfig();
const dirs = [config.dataDir + "/workspaces", config.dataDir + "/deliverables", config.dataDir + "/previews", config.dataDir + "/deployments"];
for (const dir of dirs) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`could not remove ${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
closeDb();
seedCompany({ reset: true });
closeDb();
