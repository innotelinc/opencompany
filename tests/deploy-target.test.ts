import assert from "node:assert/strict";
import test from "node:test";
import { deploymentTargetLabel } from "../src/lib/engine/deploy-target";

test("the company's own site is named by its real address", () => {
  const previous = process.env.OPENCOMPANY_PUBLIC_SITE_URL;
  process.env.OPENCOMPANY_PUBLIC_SITE_URL = "https://openco.example/site";
  try {
    assert.equal(deploymentTargetLabel(true), "https://openco.example/site");
  } finally {
    if (previous === undefined) delete process.env.OPENCOMPANY_PUBLIC_SITE_URL;
    else process.env.OPENCOMPANY_PUBLIC_SITE_URL = previous;
  }
});

test("without a configured address the site falls back to this app's /site route", () => {
  const previous = process.env.OPENCOMPANY_PUBLIC_SITE_URL;
  delete process.env.OPENCOMPANY_PUBLIC_SITE_URL;
  try {
    const target = deploymentTargetLabel(true);
    assert.match(target, /^http:\/\/127\.0\.0\.1:\d+\/site$/);
  } finally {
    if (previous !== undefined) process.env.OPENCOMPANY_PUBLIC_SITE_URL = previous;
  }
});

test("a customer deliverable names the provider, never a made-up hostname", () => {
  const target = deploymentTargetLabel(false);
  assert.doesNotMatch(target, /example\.test/);
  assert.doesNotMatch(target, /\.(com|net|site|io)\b/);
});
