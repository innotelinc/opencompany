/**
 * Idempotent foundation for the company's own public website.
 *
 * The company needs a public face that is continuously improved by an employee,
 * not a one-off customer deliverable. This adds:
 *   - a dedicated public-site web developer,
 *   - the standing brief (brand, sections, tone, contact),
 *   - a recurring improvement routine that the durable worker picks up.
 *
 * Safe to call on every seed: it only creates what is missing.
 */
import type { AppConfig } from "../src/lib/config";
import { getConfig } from "../src/lib/config";
import { getDb, newId, nowIso } from "../src/lib/db";
import {
  createEmployee,
  createKnowledgeDoc,
  createRoutine,
  listDepartments,
  listEmployees,
  listKnowledge,
  listRoutines,
  upsertComputer,
} from "../src/lib/domain/repo";

export const PUBLIC_SITE_ROUTINE = "Public site: improvement pass";
export const PUBLIC_SITE_WATCH_ROUTINE = "Public site: availability watch";
export const PUBLIC_SITE_BRIEF = "Public site brief";
export const PUBLIC_SITE_EMPLOYEE = "Nova Reyes";

const PUBLIC_SITE_KNOWLEDGE = [
  "Customer: OPENco.",
  "Industry: AI company operating system",
  "Sections: Home, About, Principles, Contact",
  "Tone: direct, calm, technically credible",
  "Contact email: hello@openco.innotel.tech",
  "Primary color: #1f3d34",
  "Accent color: #d8a24a",
  "Notes: OPENco. by Innotel Labs. Owners set direction, budget and approvals; AI employees plan, build, check and review the work. Nothing external happens without the owner.",
  "Constraints: static files only; no trackers or external assets; the contact form must not claim a backend.",
  "Web team: the web lead builds and ships the site; a separate reviewer signs off; the public site developer reports to the web lead.",
  "Availability: this site is the company's public face and must answer 24/7. Keep the last passing version online; never let an improvement pass take the site down.",
].join("\n");

/**
 * The web team is its own department. It is created on demand so an installation
 * seeded before the restructure is repaired by the same idempotent call.
 */
function ensureWebDepartment(companyId: string, added: string[]): string {
  const existing = listDepartments(companyId).find((department) => department.name === "Web");
  if (existing) return existing.id;
  const id = newId("dep");
  getDb()
    .prepare("INSERT INTO departments (id, company_id, name, charter, created_at) VALUES (?,?,?,?,?)")
    .run(id, companyId, "Web", "Front-end build, the public site, and review handoffs.", nowIso());
  added.push("department Web");
  return id;
}

export function ensurePublicSiteFoundation(companyId: string, config: AppConfig = getConfig()): string[] {
  const added: string[] = [];
  const employees = listEmployees(companyId);
  const webDepartmentId = ensureWebDepartment(companyId, added);
  const operationsManager = employees.find((employee) => /operations manager/i.test(employee.title)) ?? null;
  const webLead = employees.find((employee) => /Web Developer/i.test(employee.title)) ?? null;

  // The build role is the team lead: one person owns the web output, and the
  // public site reports into that same owner instead of floating in Operations.
  if (webLead && (webLead.departmentId !== webDepartmentId || !/Team Lead/i.test(webLead.title))) {
    getDb()
      .prepare("UPDATE employees SET department_id = ?, title = ?, updated_at = ? WHERE company_id = ? AND id = ?")
      .run(webDepartmentId, "Web Developer & Team Lead", nowIso(), companyId, webLead.id);
    added.push("web team lead");
  }

  let developer = employees.find((employee) => employee.name === PUBLIC_SITE_EMPLOYEE) ?? null;
  if (!developer) {
    developer = createEmployee({
      companyId,
      departmentId: webDepartmentId,
      managerId: webLead?.id ?? operationsManager?.id ?? null,
      name: PUBLIC_SITE_EMPLOYEE,
      title: "Public Site Developer",
      roleInstructions:
        "Own the company's public website and keep it online 24/7. Keep it accurate, fast and accessible. Improve one meaningful thing per pass and watch availability on a routine; never invent customers, prices or claims. Nothing is published externally without the owner.",
      backend: "deterministic",
      model: config.model,
      allowedTools: ["files.read", "files.write", "terminal.exec", "knowledge.read", "browser.session"],
      authority: "internal",
      spendLimitCents: 80,
    });
    added.push(`employee ${developer.name}`);
  }

  // An installation seeded before the web team existed still has this person
  // outside the department; move the reporting line when it does not match.
  const targetManagerId = webLead?.id ?? operationsManager?.id ?? null;
  if (developer.departmentId !== webDepartmentId || developer.managerId !== targetManagerId) {
    getDb()
      .prepare("UPDATE employees SET department_id = ?, manager_id = ?, updated_at = ? WHERE company_id = ? AND id = ?")
      .run(webDepartmentId, targetManagerId, nowIso(), companyId, developer.id);
    added.push("public site developer reporting line");
  }

  upsertComputer({
    companyId,
    employeeId: developer.id,
    workspacePath: `${config.dataDir}/workspaces/${companyId}/${developer.id}`,
    browserProfilePath: `${config.dataDir}/workspaces/${companyId}/${developer.id}/.browser/profile`,
    browserStatus: config.limits.browserEnabled ? "available" : "not_configured",
  });

  if (!listKnowledge(companyId).some((doc) => doc.title === PUBLIC_SITE_BRIEF)) {
    createKnowledgeDoc({
      companyId,
      title: PUBLIC_SITE_BRIEF,
      kind: "brand",
      body: PUBLIC_SITE_KNOWLEDGE,
      accessScope: "company",
    });
    added.push("public site brief");
  }

  if (!listRoutines(companyId).some((routine) => routine.name === PUBLIC_SITE_ROUTINE)) {
    createRoutine({
      companyId,
      name: PUBLIC_SITE_ROUTINE,
      instructions: [
        "Improve the company's public website by one meaningful, reviewable change.",
        "Rebuild the full static site from the public site brief so every pass stays consistent and all checks keep passing.",
        "Do not invent customers, testimonials, prices or certifications. Do not publish externally.",
      ].join("\n"),
      assigneeId: developer.id,
      intervalMinutes: 60,
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
    });
    added.push(`routine ${PUBLIC_SITE_ROUTINE}`);
  }

  // Availability is its own duty. The improvement loop ships changes; this loop
  // is the one that notices the site stopped answering and raises it.
  if (!listRoutines(companyId).some((routine) => routine.name === PUBLIC_SITE_WATCH_ROUTINE)) {
    createRoutine({
      companyId,
      name: PUBLIC_SITE_WATCH_ROUTINE,
      instructions: [
        "Check that the public site answers: fetch the site URL and confirm a 200 with the real page, not the holding page.",
        "Record what you saw — status, time and response — and say plainly when the site is down instead of reporting a healthy site you did not check.",
        "If the site is down, open a fix in your own workspace and escalate to the owner; never publish or restart production without an owner decision.",
        "Never invent uptime. A check you did not run is not a passing check.",
      ].join("\n"),
      assigneeId: developer.id,
      intervalMinutes: 15,
      nextRunAt: new Date(Date.now() + 30_000).toISOString(),
    });
    added.push(`routine ${PUBLIC_SITE_WATCH_ROUTINE}`);
  }

  return added;
}
