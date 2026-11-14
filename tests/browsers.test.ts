import "./helpers";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { closeDb } from "../src/lib/db";
import { getComputerForEmployee, getEmployee, getOwner, listEmployees } from "../src/lib/domain/repo";
import { createCompanyEmployee } from "../src/lib/domain/commands";
import { configureBrowsersForCompany } from "../src/lib/computers/employee-browser";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

const companyId = seedCompany();
const owner = getOwner(companyId)!;

test.after(() => {
  closeDb();
  cleanup();
});

test("a new employee is configured with a browser profile", () => {
  const { id } = createCompanyEmployee({
    companyId,
    actorId: owner.id,
    name: "Browser Hire",
    title: "QA",
    roleInstructions: "Check pages in your own browser.",
    departmentId: null,
    managerId: null,
    backend: "deterministic",
    allowedTools: ["files.read"],
    authority: "internal",
    spendLimitCents: 0,
  });

  const computer = getComputerForEmployee(companyId, id);
  assert.ok(computer, "a computer row is created with the employee");
  assert.ok(computer!.browserProfilePath?.endsWith(path.join(".browser", "profile")), "profile path recorded");
  assert.ok(fs.existsSync(computer!.browserProfilePath!), "profile directory exists");
  assert.ok(fs.existsSync(path.join(computer!.workspacePath, ".browser", "shots")), "screenshot directory exists");
  assert.ok(getEmployee(companyId, id)!.allowedTools.includes("browser.session"), "browser session is granted");
});

test("backfill configures every employee and is idempotent", () => {
  const first = configureBrowsersForCompany(companyId);
  assert.equal(first.setups.length, listEmployees(companyId).length);
  for (const setup of first.setups) {
    assert.ok(setup.computer.browserProfilePath, `${setup.employeeName} has a profile path`);
    assert.ok(fs.existsSync(setup.computer.browserProfilePath!), `${setup.employeeName} profile directory exists`);
    assert.equal(setup.status, "not_configured", "status follows OPENCOMPANY_BROWSER_ENABLED");
  }

  const second = configureBrowsersForCompany(companyId);
  assert.ok(
    second.setups.every((setup) => setup.toolGranted === false),
    "a second run grants nothing new",
  );
});
