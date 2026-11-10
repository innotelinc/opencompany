import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getConfig } from "@/lib/config";

export type Db = Database.Database;

let handle: Db | null = null;
let handlePath: string | null = null;

function migrationsDir() {
  return path.join(process.cwd(), "src", "lib", "db", "migrations");
}

/** Apply every migration that has not been recorded yet. */
export function migrate(db: Db): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row: any) => row.version as string),
  );
  const dir = migrationsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });
    run();
    ran.push(file);
  }
  return ran;
}

export function openDb(dbPath?: string): Db {
  const target = dbPath ?? getConfig().dbPath;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new Database(target);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 8000");
  migrate(db);
  return db;
}

/**
 * Process-wide connection. Next.js reuses this across requests; the worker has
 * its own process and therefore its own connection to the same SQLite file
 * (WAL mode + busy_timeout make that safe).
 */
export function getDb(): Db {
  const target = getConfig().dbPath;
  if (handle && handlePath === target && handle.open) return handle;
  if (handle?.open) handle.close();
  handle = openDb(target);
  handlePath = target;
  return handle;
}

export function closeDb(): void {
  if (handle?.open) handle.close();
  handle = null;
  handlePath = null;
}

export function tx<T>(fn: (db: Db) => T): T {
  const db = getDb();
  return db.transaction(fn)(db);
}

/** Short, sortable, prefixed identifiers: task_1a2b3c4d5e6f7a8b */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Deterministic JSON used for approval hashes: key order must not matter. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function actionHash(action: unknown): string {
  return sha256(canonicalJson(action));
}
