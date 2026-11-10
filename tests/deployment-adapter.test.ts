import assert from "node:assert/strict";
import test from "node:test";
import { externalActionAdapter } from "../src/lib/engine/external";

test("deployment adapter reports provider state without leaking the token", () => {
  const previous = {
    provider: process.env.OPENCOMPANY_DEPLOY_PROVIDER,
    token: process.env.VERCEL_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
  };
  try {
    delete process.env.OPENCOMPANY_DEPLOY_PROVIDER;
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;

    const unavailable = externalActionAdapter("deployment_package");
    assert.equal(unavailable.configured, false);
    assert.match(unavailable.note, /No public deployment provider/i);

    process.env.VERCEL_TOKEN = "test-token-value";
    process.env.VERCEL_PROJECT_ID = "prj_test";

    const configured = externalActionAdapter("deployment_package");
    assert.equal(configured.configured, true);
    assert.equal(configured.id, "vercel");
    assert.doesNotMatch(configured.note, /test-token-value/);
  } finally {
    for (const [key, value] of Object.entries({
      OPENCOMPANY_DEPLOY_PROVIDER: previous.provider,
      VERCEL_TOKEN: previous.token,
      VERCEL_PROJECT_ID: previous.projectId,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("an unsupported deployment provider fails closed", () => {
  const previous = process.env.OPENCOMPANY_DEPLOY_PROVIDER;
  try {
    process.env.OPENCOMPANY_DEPLOY_PROVIDER = "unknown-host";
    const adapter = externalActionAdapter("deployment_package");
    assert.equal(adapter.configured, false);
    assert.match(adapter.note, /No adapter is installed/i);
  } finally {
    if (previous === undefined) delete process.env.OPENCOMPANY_DEPLOY_PROVIDER;
    else process.env.OPENCOMPANY_DEPLOY_PROVIDER = previous;
  }
});
