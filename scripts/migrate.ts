import { closeDb, getDb } from "../src/lib/db";

const db = getDb();
const rows = db.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY version").all();
console.log(`Database ready at ${process.env.OPENCOMPANY_DB ?? ".data/opencompany.db"}`);
console.log(`Applied migrations: ${rows.length}`);
for (const row of rows as { version: string; applied_at: string }[]) {
  console.log(`  ${row.version} (${row.applied_at})`);
}
closeDb();
