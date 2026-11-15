import "./helpers";
import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAuthFailures,
  createSession,
  hashPassword,
  passwordProblem,
  recentAuthFailures,
  recordAuthFailure,
  listMemberSessions,
  resolveSessionToken,
  revokeSession,
  revokeSessionById,
  verifyPassword,
} from "../src/lib/auth";
import { closeDb } from "../src/lib/db";
import { getOwner } from "../src/lib/domain/repo";
import { seedCompany } from "../scripts/seed";
import { cleanup } from "./helpers";

const companyId = seedCompany();
const owner = getOwner(companyId);

test.after(() => {
  closeDb();
  cleanup();
});

test("a password is stored only as a salted scrypt hash", () => {
  const first = hashPassword("correct horse battery staple");
  const second = hashPassword("correct horse battery staple");
  assert.notEqual(first, second, "each hash carries its own salt");
  assert.match(first, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.ok(!first.includes("correct horse"), "the password itself is never stored");
  assert.equal(verifyPassword("correct horse battery staple", first), true);
  assert.equal(verifyPassword("correct horse battery stapl", first), false);
  assert.equal(verifyPassword("", first), false);
  assert.equal(verifyPassword("anything", null), false);
  assert.equal(verifyPassword("anything", "not-a-hash"), false);
});

test("a password has to be long enough to be worth one", () => {
  assert.match(passwordProblem("short") ?? "", /at least 10/);
  assert.equal(passwordProblem("long enough password"), null);
});

test("a session token resolves to its member and can be revoked", () => {
  const { token } = createSession({ companyId, memberId: owner.id, userAgent: "test" });
  const resolved = resolveSessionToken(token);
  assert.equal(resolved?.memberId, owner.id);
  assert.equal(resolved?.companyId, companyId);
  assert.ok(resolved && Date.parse(resolved.expiresAt) > Date.now(), "the session has a future expiry");

  revokeSession(token);
  assert.equal(resolveSessionToken(token), null, "a revoked token is dead");
  assert.equal(resolveSessionToken("made-up-token"), null);
  assert.equal(resolveSessionToken(""), null);
});

test("a session can only be revoked by the member who owns it", () => {
  const first = createSession({ companyId, memberId: owner.id, userAgent: "browser one" });
  const second = createSession({ companyId, memberId: owner.id, userAgent: "browser two" });
  const firstId = resolveSessionToken(first.token)!.id;
  const secondId = resolveSessionToken(second.token)!.id;

  const listed = listMemberSessions(owner.id).map((session) => session.id);
  assert.ok(listed.includes(firstId) && listed.includes(secondId), "both browsers are listed");

  assert.equal(revokeSessionById("hum_someone_else", firstId), false, "another member cannot revoke it");
  assert.ok(listMemberSessions(owner.id).some((session) => session.id === firstId), "and it stays alive");

  assert.equal(revokeSessionById(owner.id, firstId), true);
  assert.ok(!listMemberSessions(owner.id).some((session) => session.id === firstId));
  assert.equal(resolveSessionToken(first.token), null, "the revoked token stops resolving");
  assert.ok(resolveSessionToken(second.token), "the other browser is untouched");
});

test("failed sign-ins are counted and can be cleared", () => {
  const key = `test|${owner.email}`;
  clearAuthFailures(key);
  assert.equal(recentAuthFailures(key), 0);
  recordAuthFailure(key);
  recordAuthFailure(key);
  assert.equal(recentAuthFailures(key), 2);
  clearAuthFailures(key);
  assert.equal(recentAuthFailures(key), 0, "a successful sign-in clears the count");
});
