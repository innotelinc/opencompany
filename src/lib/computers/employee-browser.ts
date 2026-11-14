import path from "node:path";
import { browserAvailability } from "@/lib/computers/browser";
import { ensureDir, workspaceRoot } from "@/lib/computers/workspace";
import { getComputerForEmployee, grantEmployeeTool, listEmployees, upsertComputer } from "@/lib/domain/repo";
import type { Computer, Employee } from "@/lib/domain/types";

/**
 * Every employee owns one computer, and every computer has a browser profile.
 * Configuration is idempotent: it creates the workspace and profile
 * directories, refreshes the recorded browser status and makes sure the
 * employee may use `browser.session`. Running it again after the host changes
 * (installing Chromium, for example) updates the row instead of adding another.
 */

export type BrowserSetup = {
  employeeId: string;
  employeeName: string;
  computer: Computer;
  status: string;
  toolGranted: boolean;
};

export function configureEmployeeBrowser(companyId: string, employee: Employee): BrowserSetup {
  const availability = browserAvailability();
  const status = availability.available ? "available" : "not_configured";
  const existing = getComputerForEmployee(companyId, employee.id);
  const workspacePath = existing?.workspacePath ?? workspaceRoot(companyId, employee.id);
  const profilePath = path.join(workspacePath, ".browser", "profile");
  ensureDir(path.join(workspacePath, ".browser", "shots"));
  ensureDir(profilePath);
  const computer = upsertComputer({
    companyId,
    employeeId: employee.id,
    workspacePath,
    browserProfilePath: profilePath,
    browserStatus: status,
  });
  const toolGranted = grantEmployeeTool(companyId, employee.id, "browser.session");
  return { employeeId: employee.id, employeeName: employee.name, computer, status, toolGranted };
}

export function configureBrowsersForCompany(companyId: string): {
  status: string;
  reason: string;
  setups: BrowserSetup[];
} {
  const availability = browserAvailability();
  const setups = listEmployees(companyId).map((employee) => configureEmployeeBrowser(companyId, employee));
  return { status: availability.available ? "available" : "not_configured", reason: availability.reason, setups };
}
