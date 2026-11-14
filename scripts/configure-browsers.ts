/**
 * Configure a persistent browser profile for every employee (idempotent).
 * Run it after installing Chromium, or when employees were added outside the
 * owner console. New employees get the same setup automatically.
 */
import { closeDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import { getCompanyBySlug } from "../src/lib/domain/repo";
import { configureBrowsersForCompany } from "../src/lib/computers/employee-browser";

const company = getCompanyBySlug(getConfig().companySlug);
if (!company) throw new Error("Company not found. Run npm run db:seed first.");

const { status, reason, setups } = configureBrowsersForCompany(company.id);
console.log(`Browser runtime: ${status} — ${reason}`);
for (const setup of setups) {
  const granted = setup.toolGranted ? ", browser.session granted" : "";
  console.log(`  ${setup.employeeName}: ${setup.status}${granted}`);
}
console.log(`${setups.length} employee(s) configured.`);
closeDb();
