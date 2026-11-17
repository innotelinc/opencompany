import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { contentSecurityPolicy, inlineStyleHashes } from "../src/lib/public-site/csp";

function digest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

test("a style attribute is allowed by its own hash, never by unsafe-inline", () => {
  const html = `<p style="margin-top: 3rem;">x</p>`;
  const policy = contentSecurityPolicy(html);
  assert.match(policy, /style-src 'self' 'unsafe-hashes' 'sha256-/);
  assert.ok(policy.includes(`'sha256-${digest("margin-top: 3rem;")}'`));
  assert.doesNotMatch(policy, /unsafe-inline/);
});

test("a style element is hashed by its contents", () => {
  const policy = contentSecurityPolicy(`<style>body{color:red}</style>`);
  assert.ok(policy.includes(`'sha256-${digest("body{color:red}")}'`));
  assert.doesNotMatch(policy, /unsafe-hashes/);
});

test("pages without inline styles get no style exceptions", () => {
  const policy = contentSecurityPolicy("<p>plain</p>");
  assert.match(policy, /style-src 'self';/);
  assert.doesNotMatch(policy, /sha256-|unsafe-inline|unsafe-hashes/);
});

test("non-HTML files are served with the same narrowing", () => {
  const policy = contentSecurityPolicy();
  assert.match(policy, /style-src 'self';/);
  assert.match(policy, /default-src 'none'/);
  assert.doesNotMatch(policy, /unsafe/);
});

test("hashes are stable and de-duplicated per page", () => {
  const html = `<p style="a:1">x</p><p style="a:1">y</p><style>b{}</style><style>b{}</style>`;
  const { elements, attributes } = inlineStyleHashes(html);
  assert.deepEqual(elements, [`'sha256-${digest("b{}")}'`]);
  assert.deepEqual(attributes, [`'sha256-${digest("a:1")}'`]);
});
