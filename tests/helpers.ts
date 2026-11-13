import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Test environment. Imported first by every test file so the database and data
 * directory are isolated before any module reads configuration.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencompany-test-"));
process.env.OPENCOMPANY_DATA_DIR = dir;
process.env.OPENCOMPANY_DB = path.join(dir, "test.db");
process.env.OPENCOMPANY_COMPANY_SLUG = "test-studio";
process.env.OPENCOMPANY_OWNER_EMAIL = "owner@test-studio.test";
process.env.OPENCOMPANY_AGENT_BACKEND = "deterministic";
process.env.OPENCOMPANY_MONTHLY_BUDGET_CENTS = "2500";
process.env.OPENCOMPANY_AUTO_APPROVE_CENTS = "300";
process.env.OPENCOMPANY_MAX_ATTEMPTS = "2";
process.env.OPENCOMPANY_MAX_REVIEW_ROUNDS = "2";
process.env.OPENCOMPANY_MAX_DELEGATION_DEPTH = "3";
process.env.OPENCOMPANY_WORKER_POLL_MS = "50";

export const testDir = dir;

export const REQUIREMENTS = [
  "Customer: OPENco.",
  "Industry: AI company operating system",
  "Sections: Home, About, Services, Contact",
  "Tone: calm, precise, human",
  "Contact email: hello@openco.innotel.tech",
  "Notes: Small business owners who want clear numbers and no surprises.",
].join("\n");

export function cleanup(): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
