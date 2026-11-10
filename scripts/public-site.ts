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
export const PUBLIC_SITE_BRIEF = "Public site brief";
export const PUBLIC_SITE_EMPLOYEE = "Nova Reyes";

const PUBLIC_SITE_KNOWLEDGE = [
  "Customer: OpenCompany",
  "Industry: AI company operating system",
  "Sections: Home, About, Principles, Contact",
  "Tone: direct, calm, technically credible",
  "Contact email: hello@opencompany.test",
  "Primary color: #1f3d34",
  "Accent color: #d8a24a",
  "Notes: Owners set direction, budget and approvals; AI employees plan, build, check and review the work. Nothing external happens without the owner.",
  "Constraints: static files only; no trackers or external assets; the contact form must not claim a backend.",
].join("\n");

export function ensurePublicSiteFoundation(companyId: string, config: AppConfig = getConfig()): string[] {
  const added: string[] = [];
  const employees = listEmployees(companyId);
  const departments = listDepartments(companyId);
  const engineering = departments.find((department) => department.name === "Engineering") ?? null;
  const operationsManager = employees.find((employee) => /operations manager/i.test(employee.title)) ?? null;

  let developer = employees.find((employee) => employee.name === PUBLIC_SITE_EMPLOYEE) ?? null;
  if (!developer) {
    developer = createEmployee({
      companyId,
      departmentId: engineering?.id ?? null,
      managerId: operationsManager?.id ?? null,
      name: PUBLIC_SITE_EMPLOYEE,
      title: "Public Site Developer",
      roleInstructions:
        "Own the company's public website. Keep it accurate, fast and accessible. Improve one meaningful thing per pass; never invent customers, prices or claims. Nothing is published externally without the owner.",
      backend: "deterministic",
      model: config.model,
      allowedTools: ["files.read", "files.write", "terminal.exec", "knowledge.read", "browser.session"],
      authority: "internal",
      spendLimitCents: 80,
    });
    added.push(`employee ${developer.name}`);
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

  return added;
}
