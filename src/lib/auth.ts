import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, newId, nowIso } from "@/lib/db";

/**
 * Passwords and sessions.
 *
 * A password is stored only as a scrypt hash with its own salt, so a copy of the
 * database does not contain anyone's password. A session is a random token the
 * browser holds in an HttpOnly cookie; the database stores only its SHA-256, so a
 * leaked database copy cannot be replayed as a signed-in browser either.
 */
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK = 8;
const SCRYPT_PARALLEL = 1;
const KEY_BYTES = 64;

export const SESSION_COOKIE = "oc_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TOUCH_INTERVAL_MS = 1000 * 60 * 5;
export const MIN_PASSWORD_LENGTH = 10;

export const SIGNIN_WINDOW_MS = 1000 * 60 * 15;
export const SIGNIN_MAX_FAILURES = 5;

export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return "That password is too long.";
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK,
    p: SCRYPT_PARALLEL,
  });
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK,
    SCRYPT_PARALLEL,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !password) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, cost, block, parallel, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;
  try {
    const derived = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: Number(cost),
      r: Number(block),
      p: Number(parallel),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResolvedSession {
  id: string;
  companyId: string;
  memberId: string;
  expiresAt: string;
}

export function createSession(input: {
  companyId: string;
  memberId: string;
  userAgent?: string | null;
  /** The identity provider's token for this browser, if it signed in through one. */
  idToken?: string | null;
}): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  getDb()
    .prepare(
      `INSERT INTO auth_sessions (id, company_id, human_member_id, token_hash, created_at, expires_at, last_seen_at, user_agent, id_token)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      newId("sess"),
      input.companyId,
      input.memberId,
      hashToken(token),
      now.toISOString(),
      expiresAt,
      now.toISOString(),
      input.userAgent?.slice(0, 200) ?? null,
      input.idToken ?? null,
    );
  return { token, expiresAt };
}

export function resolveSessionToken(token: string): ResolvedSession | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      "SELECT id, company_id, human_member_id, expires_at, last_seen_at FROM auth_sessions WHERE token_hash = ?",
    )
    .get(hashToken(token)) as
    | { id: string; company_id: string; human_member_id: string; expires_at: string; last_seen_at: string }
    | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  if (Date.now() - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    getDb().prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.id);
  }
  return {
    id: row.id,
    companyId: row.company_id,
    memberId: row.human_member_id,
    expiresAt: row.expires_at,
  };
}

export interface MemberSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
}

/** The browsers currently signed in as this person, newest activity first. */
export function listMemberSessions(memberId: string): MemberSession[] {
  return getDb()
    .prepare(
      `SELECT id, created_at, last_seen_at, expires_at, user_agent FROM auth_sessions
       WHERE human_member_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
    )
    .all(memberId, new Date().toISOString())
    .map((r: any) => ({
      id: r.id,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      expiresAt: r.expires_at,
      userAgent: r.user_agent,
    }));
}

/** Revoke one of this person's sessions. Scoped by member, so an id alone is not enough. */
export function revokeSessionById(memberId: string, sessionId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM auth_sessions WHERE human_member_id = ? AND id = ?")
    .run(memberId, sessionId);
  return result.changes > 0;
}

export function revokeSession(token: string): void {
  if (!token) return;
  getDb().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
}

/**
 * The identity provider's token for this browser, read before the session is deleted.
 * Signing out hands it back so the provider ends its own session too.
 */
export function sessionIdentityToken(token: string): string | null {
  if (!token) return null;
  const row = getDb()
    .prepare("SELECT id_token FROM auth_sessions WHERE token_hash = ?")
    .get(hashToken(token)) as { id_token: string | null } | undefined;
  return row?.id_token ?? null;
}

/** Sign out every other browser for this person, e.g. after a password change. */
export function revokeOtherSessions(memberId: string, keepSessionId?: string): number {
  const statement = keepSessionId
    ? getDb()
        .prepare("DELETE FROM auth_sessions WHERE human_member_id = ? AND id <> ?")
        .run(memberId, keepSessionId)
    : getDb().prepare("DELETE FROM auth_sessions WHERE human_member_id = ?").run(memberId);
  return statement.changes;
}

export function recordAuthFailure(key: string): void {
  const db = getDb();
  db.prepare("INSERT INTO auth_attempts (id, attempt_key, attempted_at) VALUES (?,?,?)").run(
    newId("att"),
    key,
    nowIso(),
  );
  // Housekeeping: nobody needs a month of failed-attempt rows.
  db.prepare("DELETE FROM auth_attempts WHERE attempted_at < ?").run(
    new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  );
}

export function recentAuthFailures(key: string, windowMs = SIGNIN_WINDOW_MS): number {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE attempt_key = ? AND attempted_at >= ?")
    .get(key, since) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export function clearAuthFailures(key: string): void {
  getDb().prepare("DELETE FROM auth_attempts WHERE attempt_key = ?").run(key);
}
