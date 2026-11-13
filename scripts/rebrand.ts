/**
 * Renames the old demo identity to OPENco. by Innotel Labs in an existing database.
 *
 * The brand used to be seeded as "Northwind Studio" with a fictional customer,
 * "Larkspur & Ledger". New installs seed OPENco. directly; this brings an
 * existing install (local, box, container) in line without reseeding, so tasks,
 * deliverables, ledger entries and reviews keep their ids and history.
 *
 *   npm run db:rebrand            # uses OPENCOMPANY_DB / OPENCOMPANY_DATA_DIR
 *   OPENCOMPANY_DB=/app/.data/opencompany.db npm run db:rebrand
 */
import { getConfig } from "../src/lib/config";
import { closeDb, getDb } from "../src/lib/db";

const REPLACEMENTS: [RegExp, string][] = [
  [/Larkspur (?:&amp;|&) Ledger/g, "OPENco."],
  [/Larkspur & Ledger/g, "OPENco."],
  [/larkspur-ledger\.test/g, "openco.innotel.tech"],
  [/larkspur-ledger/g, "openco"],
  [/Larkspur/g, "OPENco."],
  [/larkspur/g, "openco"],
  [/hello@openco\.innotel\.tech/g, "hello@openco.innotel.tech"],
  [/independent bookkeeping studio/g, "AI company operating system"],
  [/OpenCompany public site/g, "OPENco. public site"],
  [/Northwind Studio/g, "OPENco."],
  [/Avery Lin/g, "Innotel Labs"],
  [/owner@northwind-studio\.test/g, "owner@openco.innotel.tech"],
  [/\bOpenCompany\b/g, "OPENco."],
];

function scrub(value: string): string {
  let next = value;
  for (const [pattern, replacement] of REPLACEMENTS) next = next.replace(pattern, replacement);
  return next;
}

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .all() as { name: string }[];

let changedRows = 0;
for (const { name } of tables) {
  const columns = (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string }[]).filter(
    (column) => /TEXT|CHAR|CLOB/i.test(column.type) || column.type === "",
  );
  if (!columns.length) continue;
  for (const row of db.prepare(`SELECT rowid AS __rowid, * FROM "${name}"`).all() as Record<string, unknown>[]) {
    const updates: Record<string, string> = {};
    for (const column of columns) {
      const value = row[column.name];
      if (typeof value !== "string") continue;
      const next = scrub(value);
      if (next !== value) updates[column.name] = next;
    }
    const keys = Object.keys(updates);
    if (!keys.length) continue;
    const sql = `UPDATE "${name}" SET ${keys.map((key) => `"${key}" = ?`).join(", ")} WHERE rowid = ?`;
    db.prepare(sql).run(...keys.map((key) => updates[key]), row.__rowid as number);
    changedRows += 1;
  }
}

console.log(`Rebranded ${changedRows} row(s) in ${getConfig().dbPath}.`);
closeDb();
