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
  resolveSessionToken,
  revokeSession,
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
