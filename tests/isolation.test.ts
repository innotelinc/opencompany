import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import { getDb, newId, nowIso } from "../src/lib/db";
import {
  createDecision,
  createKnowledgeDoc,
  getEmployee,
  getTask,
  listDecisions,
  listEmployees,
  listKnowledgeForEmployee,
  listTasks,
  canEmployeeReadDoc,
} from "../src/lib/domain/repo";
import { closeDb } from "../src/lib/db";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";
import { actionHash } from "../src/lib/db";
import { createTask } from "../src/lib/domain/repo";

const companyId = seedCompany();
const otherCompanyId = newId("co");

getDb()
  .prepare("INSERT INTO companies (id, slug, name, mission, created_at) VALUES (?,?,?,?,?)")
  .run(otherCompanyId, "other-co", "Other Co", "A different company.", nowIso());

const otherEmployeeId = newId("emp");
getDb()
  .prepare(
    `INSERT INTO employees (id, company_id, name, title, role_instructions, backend, allowed_tools, authority, spend_limit_cents, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(otherEmployeeId, otherCompanyId, "Other Employee", "Intruder", "none", "deterministic", "[]", "internal", 0, nowIso(), nowIso());

test.after(() => {
  closeDb();
  cleanup();
});

test("company boundaries are enforced in the repository", () => {
  assert.equal(getEmployee(companyId, otherEmployeeId), null, "cannot read an employee from another company");
  assert.equal(getEmployee(otherCompanyId, otherEmployeeId)?.name, "Other Employee");

  const task = createTask({
    companyId,
    title: "Private task",
    description: "Company A only",
    kind: "work",
    acceptanceCriteria: ["exists"],
  });
  assert.equal(getTask(otherCompanyId, task.id), null);
  assert.equal(getTask(companyId, task.id)?.title, "Private task");
  assert.ok(!listTasks(otherCompanyId).some((candidate) => candidate.id === task.id));

  const decision = createDecision({
    companyId,
    requestedByEmployeeId: null,
    taskId: null,
    projectId: null,
    kind: "spend",
    title: "Company A spend",
    businessReason: "test",
    action: {},
    actionHash: actionHash({}),
    risk: "low",
  });
  assert.ok(listDecisions(companyId).some((candidate) => candidate.id === decision.id));
  assert.ok(!listDecisions(otherCompanyId).some((candidate) => candidate.id === decision.id));
  assert.equal(listEmployees(otherCompanyId).length, 1);
});

test("knowledge access is scoped by department and owner", () => {
  const employees = listEmployees(companyId);
  const developer = employees.find((employee) => /Web Developer/.test(employee.title))!;
  const researcher = employees.find((employee) => /Researcher/.test(employee.title))!;

  const companyDoc = createKnowledgeDoc({ companyId, title: "Company policy", body: "everyone" });
  const departmentDoc = createKnowledgeDoc({
    companyId,
    title: "Engineering notes",
    body: "engineering only",
    accessScope: "department",
    departmentId: developer.departmentId,
  });
  const privateDoc = createKnowledgeDoc({
    companyId,
    title: "Developer journal",
    body: "private",
    accessScope: "private",
    ownerEmployeeId: developer.id,
  });

  assert.equal(canEmployeeReadDoc(developer, companyDoc), true);
  assert.equal(canEmployeeReadDoc(developer, departmentDoc), true);
  assert.equal(canEmployeeReadDoc(researcher, departmentDoc), false);
  assert.equal(canEmployeeReadDoc(developer, privateDoc), true);
  assert.equal(canEmployeeReadDoc(researcher, privateDoc), false);

  const researcherDocs = listKnowledgeForEmployee(companyId, researcher).map((doc) => doc.title);
  assert.ok(researcherDocs.includes("Company policy"));
  assert.ok(!researcherDocs.includes("Engineering notes"));
  assert.ok(!researcherDocs.includes("Developer journal"));
});
