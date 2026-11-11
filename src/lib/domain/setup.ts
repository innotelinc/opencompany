import { getDb, newId, nowIso } from "@/lib/db";
import { getPolicies, recordActivity, setPolicy } from "@/lib/domain/repo";

/**
 * Company setup: the identity, departments, positions and work titles the
 * platform runs on. Everything here is owner-editable and company-scoped.
 */

export interface Position {
  key: string;
  name: string;
  alias: string;
}

/**
 * Standard regulatory and corporate positions. Names and aliases are editable —
 * a company can call the Compliance Officer "Head of Regulatory Affairs" and
 * keep "CCO" as the alias, or the reverse.
 */
export const DEFAULT_POSITIONS: Position[] = [
  { key: "chief_executive", name: "Chief Executive Officer", alias: "CEO" },
  { key: "chief_operating", name: "Chief Operating Officer", alias: "COO" },
  { key: "chief_financial", name: "Chief Financial Officer", alias: "CFO" },
  { key: "chief_compliance", name: "Chief Compliance Officer", alias: "CCO" },
  { key: "compliance_officer", name: "Compliance Officer", alias: "CO" },
  { key: "mlro", name: "Money Laundering Reporting Officer", alias: "MLRO" },
  { key: "dpo", name: "Data Protection Officer", alias: "DPO" },
  { key: "ciso", name: "Chief Information Security Officer", alias: "CISO" },
  { key: "risk_manager", name: "Risk Manager", alias: "RM" },
  { key: "internal_auditor", name: "Internal Auditor", alias: "IA" },
  { key: "general_counsel", name: "General Counsel", alias: "GC" },
  { key: "company_secretary", name: "Company Secretary", alias: "CoSec" },
  { key: "hr_director", name: "HR Director", alias: "HRD" },
  { key: "head_of_engineering", name: "Head of Engineering", alias: "HoE" },
  { key: "public_site_developer", name: "Public Site Developer", alias: "PSD" },
];

const POSITIONS_POLICY = "org.positions";

export function getPositions(companyId: string): Position[] {
  const stored = getPolicies(companyId)[POSITIONS_POLICY];
  const rows = Array.isArray(stored) ? stored : [];
  return DEFAULT_POSITIONS.map((base) => {
    const found = rows.find(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && (row as Record<string, unknown>).key === base.key,
    );
    if (!found) return { ...base };
    return {
      key: base.key,
      name: typeof found.name === "string" && found.name.trim() ? found.name.trim() : base.name,
      alias: typeof found.alias === "string" ? found.alias.trim() : base.alias,
    };
  });
}

export function savePosition(input: {
  companyId: string;
  ownerId: string;
  key: string;
  name: string;
  alias: string;
}): { ok: boolean; reason?: string } {
  if (!DEFAULT_POSITIONS.some((position) => position.key === input.key)) {
    return { ok: false, reason: "Unknown position." };
  }
  const base = DEFAULT_POSITIONS.find((position) => position.key === input.key)!;
  const positions = getPositions(input.companyId).map((position) =>
    position.key === input.key
      ? {
          key: input.key,
          name: input.name.trim() || base.name,
          alias: input.alias.trim(),
        }
      : position,
  );
  setPolicy(input.companyId, POSITIONS_POLICY, positions, "Owner-editable position names and aliases.");
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "org.position_updated",
    summary: `Position renamed to "${positions.find((position) => position.key === input.key)!.name}"${
      input.alias.trim() ? ` (${input.alias.trim()})` : ""
    }.`,
    payload: { key: input.key },
  });
  return { ok: true };
}

export function resetPositions(companyId: string, ownerId: string): void {
  setPolicy(companyId, POSITIONS_POLICY, [], "Standard regulatory position names.");
  recordActivity({
    companyId,
    actorType: "human",
    actorId: ownerId,
    type: "org.positions_reset",
    summary: "Position names reset to the standard regulatory titles.",
  });
}

export function updateCompanyIdentity(input: {
  companyId: string;
  ownerId: string;
  name?: string;
  mission?: string;
  operatingPrinciples?: string;
}): { ok: boolean; reason?: string } {
  const row = getDb().prepare("SELECT * FROM companies WHERE id = ?").get(input.companyId) as
    | { name: string; mission: string; operating_principles: string }
    | undefined;
  if (!row) return { ok: false, reason: "Company not found." };
  const name = input.name?.trim() || row.name;
  const mission = input.mission?.trim() || row.mission;
  const principles =
    typeof input.operatingPrinciples === "string" ? input.operatingPrinciples : row.operating_principles;
  getDb()
    .prepare("UPDATE companies SET name = ?, mission = ?, operating_principles = ? WHERE id = ?")
    .run(name, mission, principles, input.companyId);
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "company.updated",
    summary: `Company profile updated: ${name}.`,
    payload: { name, mission },
  });
  return { ok: true };
}

export function createDepartment(input: {
  companyId: string;
  ownerId: string;
  name: string;
  charter?: string;
}): { ok: boolean; id?: string; reason?: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "A department name is required." };
  const id = newId("dep");
  try {
    getDb()
      .prepare("INSERT INTO departments (id, company_id, name, charter, created_at) VALUES (?,?,?,?,?)")
      .run(id, input.companyId, name, input.charter?.trim() ?? "", nowIso());
  } catch {
    return { ok: false, reason: `A department called "${name}" already exists.` };
  }
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "org.department_created",
    summary: `Department created: ${name}.`,
    payload: { departmentId: id },
  });
  return { ok: true, id };
}

export function renameDepartment(input: {
  companyId: string;
  ownerId: string;
  departmentId: string;
  name: string;
}): { ok: boolean; reason?: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "A department name is required." };
  try {
    getDb()
      .prepare("UPDATE departments SET name = ? WHERE id = ? AND company_id = ?")
      .run(name, input.departmentId, input.companyId);
  } catch {
    return { ok: false, reason: `A department called "${name}" already exists.` };
  }
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "org.department_renamed",
    summary: `Department renamed to ${name}.`,
    payload: { departmentId: input.departmentId },
  });
  return { ok: true };
}

export function updateWorkTitle(input: {
  companyId: string;
  ownerId: string;
  employeeId: string;
  title: string;
}): { ok: boolean; reason?: string } {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: "A work title is required." };
  const result = getDb()
    .prepare("UPDATE employees SET title = ?, updated_at = ? WHERE id = ? AND company_id = ?")
    .run(title, nowIso(), input.employeeId, input.companyId);
  if (result.changes !== 1) return { ok: false, reason: "Employee not found." };
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "org.title_updated",
    summary: `Work title changed to ${title}.`,
    payload: { employeeId: input.employeeId },
  });
  return { ok: true };
}

/** Remove a knowledge document and its version history. */
export function deleteKnowledgeDocument(input: {
  companyId: string;
  ownerId: string;
  docId: string;
}): { ok: boolean; reason?: string } {
  const db = getDb();
  const doc = db
    .prepare("SELECT title FROM knowledge_docs WHERE id = ? AND company_id = ?")
    .get(input.docId, input.companyId) as { title: string } | undefined;
  if (!doc) return { ok: false, reason: "Document not found in this company." };
  db.transaction(() => {
    db.prepare("DELETE FROM knowledge_doc_versions WHERE company_id = ? AND doc_id = ?").run(
      input.companyId,
      input.docId,
    );
    db.prepare("DELETE FROM knowledge_docs WHERE id = ? AND company_id = ?").run(input.docId, input.companyId);
  })();
  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.ownerId,
    type: "knowledge.deleted",
    summary: `Owner removed the knowledge document "${doc.title}".`,
    payload: { docId: input.docId },
  });
  return { ok: true };
}
