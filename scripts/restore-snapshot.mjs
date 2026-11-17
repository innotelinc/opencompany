/**
 * Restore the database from a snapshot before the app starts.
 *
 * This exists for one job: moving a running installation onto the host that
 * Coolify manages without losing the company's history. The snapshot URL is set
 * once, the restore refuses to touch a database that already holds a company, and
 * the variable is removed after the first boot. With no URL set it does nothing.
 *
 * Plain JavaScript on purpose: `node` runs this file directly inside the image.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";

const url = process.env.OPENCOMPANY_RESTORE_URL;
if (!url) process.exit(0);

const dataDir = process.env.OPENCOMPANY_DATA_DIR ?? "/app/.data";
const dbPath = path.resolve(process.env.OPENCOMPANY_DB ?? path.join(dataDir, "opencompany.db"));

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

/** Companies already in the local database. Zero also covers "no file yet". */
function existingCompanies() {
  if (!fs.existsSync(dbPath)) return 0;
  try {
    const db = new Database(dbPath, { readonly: true });
    const table = db
      .prepare("select name from sqlite_master where type = 'table' and name = 'companies'")
      .get();
    if (!table) {
      db.close();
      return 0;
    }
    const row = db.prepare("select count(*) as count from companies").get();
    db.close();
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

if (existingCompanies() > 0) {
  console.log(`[restore] ${dbPath} already holds a company; nothing restored`);
  process.exit(0);
}

let response;
try {
  response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
} catch (error) {
  console.error(`[restore] could not download the snapshot: ${String(error)}`);
  process.exit(0);
}
if (!response.ok) {
  console.error(`[restore] the snapshot URL answered ${response.status}; keeping the local database`);
  process.exit(0);
}

const body = Buffer.from(await response.arrayBuffer());
const sqlite = url.endsWith(".gz") ? zlib.gunzipSync(body) : body;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const temporary = `${dbPath}.restoring`;
fs.writeFileSync(temporary, sqlite);
// A stale write-ahead log next to a replaced file would be replayed into it.
for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
fs.renameSync(temporary, dbPath);
console.log(`[restore] restored ${sqlite.length} bytes into ${dbPath}`);
