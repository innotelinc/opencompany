/**
 * Operator command for changing a policy outside the app.
 *
 * The app records its own policy changes through the API. When an operator edits
 * the database directly — retiring a legacy row, correcting a value — the change
 * and its audit entry have to be written together, or the history stops
 * explaining itself. This writes both in one transaction.
 *
 *   npm run policy -- list
 *   npm run policy -- set budget.annual_limit_cents 1200000 --note "owner's yearly budget"
 *   npm run policy -- remove budget.monthly_limit_cents --note "retired; the yearly budget replaces it"
 *
 * Values are read as JSON when they parse (numbers, true/false, objects) and as
 * plain strings otherwise. Pass --company <slug> if the database holds more than
 * one company.
 */
import { closeDb, getDb } from "../src/lib/db";
import { getConfig } from "../src/lib/config";
import { deletePolicy, getCompanyBySlug, getPolicies, recordActivity, setPolicy } from "../src/lib/domain/repo";

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(
    [
      "usage:",
      "  npm run policy -- list [--company <slug>]",
      "  npm run policy -- set <key> <value> [--note <why>] [--company <slug>]",
      "  npm run policy -- remove <key> [--note <why>] [--company <slug>]",
      "",
      "Every set or remove writes an audit entry with the old and new value.",
    ].join("\n"),
  );
  process.exit(1);
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--note" || arg === "--company") {
    const value = argv[index + 1];
    if (value === undefined) usage(`${arg} needs a value.`);
    flags.set(arg, value);
    index += 1;
  } else if (arg.startsWith("--")) {
    usage(`Unknown flag ${arg}.`);
  } else {
    positional.push(arg);
  }
}

const company = getCompanyBySlug(flags.get("--company") ?? getConfig().companySlug);
if (!company) usage("Company not found. Check --company, or run npm run db:seed first.");

const [command, key, rawValue] = positional;
const note = flags.get("--note")?.trim() ?? "";

if (command === "list") {
  const policies = getPolicies(company.id);
  const keys = Object.keys(policies).filter((candidate) => key === undefined || candidate.includes(key));
  if (keys.length === 0) console.log(`no policies matching ${key}`);
  for (const candidate of keys.sort()) {
    console.log(`${candidate} = ${JSON.stringify(policies[candidate])}`);
  }
  closeDb();
  process.exit(0);
}

if (command !== "set" && command !== "remove") usage(command ? `Unknown command ${command}.` : undefined);
if (!key) usage("Name the policy key.");
if (command === "set" && rawValue === undefined) usage("set needs a value.");

const before = getPolicies(company.id);
const existed = Object.prototype.hasOwnProperty.call(before, key);
const next = command === "set" ? parseValue(rawValue as string) : undefined;

if (command === "remove" && !existed) {
  console.log(`${key} was not set; nothing to remove, and no audit entry written.`);
  closeDb();
  process.exit(0);
}

const db = getDb();
db.transaction(() => {
  if (command === "set") {
    setPolicy(company.id, key, next, note || "Set by an operator outside the app.");
  } else {
    deletePolicy(company.id, key);
  }
  recordActivity({
    companyId: company.id,
    actorType: "system",
    type: "policy.updated",
    summary:
      `Policy ${command === "set" ? "set" : "removed"} outside the app: ${key}` +
      (command === "set" ? ` = ${JSON.stringify(next)}` : "") +
      (existed ? ` (was ${JSON.stringify(before[key])})` : " (was not set)") +
      (note ? `. ${note}` : "."),
    payload: {
      source: "operator-cli",
      action: command,
      key,
      from: existed ? before[key] : null,
      to: command === "set" ? next : null,
      note: note || null,
    },
  });
})();

if (command === "set") {
  console.log(`${key} = ${JSON.stringify(next)}${existed ? ` (was ${JSON.stringify(before[key])})` : ""}`);
} else {
  console.log(`${key} removed (was ${JSON.stringify(before[key])})`);
}
console.log(`audit: recorded on ${company.slug}`);
closeDb();
