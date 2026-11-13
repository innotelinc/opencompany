import fs from "node:fs";
import { getConfig } from "../src/lib/config";
import {
  addDeliverableVersion,
  createDeliverable,
  getCompanyBySlug,
  getDeliverableByName,
  listEmployees,
} from "../src/lib/domain/repo";
import { persistFiles } from "../src/lib/engine/artifacts";
import { checksPassed, runChecks } from "../src/lib/engine/checks";
import { renderPublicSite } from "../src/lib/public-site/site";

/**
 * Publish the site that lives in `src/lib/public-site/site.tsx`.
 *
 * The improvement routine renders a site through the agent backend, so a design
 * change made in code would otherwise wait for a model to redraw it. This
 * publishes the reviewed React pages instead, through the same checks the
 * routine is held to, as a new version of the one canonical deliverable that
 * `/site` serves. Nothing is published externally.
 */
if (fs.existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // A malformed .env should not stop an otherwise explicit publish.
  }
}

const company = getCompanyBySlug(getConfig().companySlug);
if (!company) throw new Error("No company found. Run `npm run db:seed` first.");

const files = new Map(
  Object.entries(
    renderPublicSite({
      customer: "OPENco.",
      industry: "AI company operating system",
      contactEmail: "hello@openco.innotel.tech",
      primaryColor: "#1f3d34",
      accentColor: "#d8a24a",
      tone: "direct, calm, technically credible",
      notes: "Tech-first rebuild for a technical audience.",
    }),
  ),
);

const checks = runChecks(files, [
  "html_structure",
  "balanced_tags",
  "stylesheet_present",
  "accessibility_basics",
  "no_placeholder_text",
  "customer_requirements_covered",
]);
for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
if (!checksPassed(checks)) {
  console.error("Nothing published: the site did not pass its checks.");
  process.exit(1);
}

const owner = listEmployees(company.id).find((employee) => /Public Site Developer/i.test(employee.title));
const existing = getDeliverableByName(company.id, "OPENco. public site");
const deliverable =
  existing ??
  createDeliverable({
    companyId: company.id,
    projectId: null,
    taskId: null,
    name: "OPENco. public site",
    kind: "website",
  });

const version = (deliverable.currentVersion ?? 0) + 1;
const persisted = persistFiles({ companyId: company.id, deliverableId: deliverable.id, version, files });
addDeliverableVersion({
  companyId: company.id,
  deliverableId: deliverable.id,
  artifactPath: persisted.artifactPath,
  manifest: persisted.manifest,
  entryFile: "index.html",
  notes: "Published from src/lib/public-site/site.tsx after passing deliverable checks.",
  checks,
  checksPassed: true,
  createdByEmployeeId: owner?.id ?? "",
  runId: "",
});
console.log(`Published version ${version} of ${deliverable.name} (${files.size} files).`);
