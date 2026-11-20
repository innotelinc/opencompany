import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import { closeDb } from "../src/lib/db";
import { listDepartments, listEmployees } from "../src/lib/domain/repo";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

const companyId = seedCompany();
const employees = listEmployees(companyId);
const departments = listDepartments(companyId);

test.after(() => {
  closeDb();
  cleanup();
});

test("the web team is its own department with a lead and the public site in it", () => {
  const web = departments.find((department) => department.name === "Web");
  assert.ok(web, "a Web department should exist");

  const lead = employees.find((employee) => /Web Developer & Team Lead/.test(employee.title));
  assert.ok(lead, "the web team needs a lead who builds");
  assert.equal(lead.departmentId, web.id, "the lead belongs to the Web department");

  const site = employees.find((employee) => /Public Site Developer/.test(employee.title));
  assert.ok(site, "the public site developer should exist");
  assert.equal(site.departmentId, web.id, "the public site belongs to the web team");
  assert.equal(site.managerId, lead.id, "the public site reports to the web lead");
});

test("review stays independent of the people who build the site", () => {
  const web = departments.find((department) => department.name === "Web")!;
  const lead = employees.find((employee) => /Web Developer & Team Lead/.test(employee.title))!;
  const reviewer = employees.find((employee) => /Quality Reviewer/.test(employee.title))!;

  assert.notEqual(reviewer.departmentId, web.id, "the reviewer is not in the web team");
  assert.notEqual(reviewer.managerId, lead.id, "the reviewer does not report to the web lead");
  assert.ok(
    reviewer.allowedTools.includes("review.approve"),
    "the reviewer is the one who can approve a deliverable",
  );
  assert.ok(
    !lead.allowedTools.includes("review.approve"),
    "the builder cannot approve its own artifact",
  );
});

test("the web lead keeps the build tools the team needs", () => {
  const lead = employees.find((employee) => /Web Developer & Team Lead/.test(employee.title))!;
  for (const tool of ["files.read", "files.write", "terminal.exec"]) {
    assert.ok(lead.allowedTools.includes(tool), `the lead needs ${tool}`);
  }
});
