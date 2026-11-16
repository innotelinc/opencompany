import assert from "node:assert/strict";
import test from "node:test";
import { externalActionAdapter } from "../src/lib/engine/external";

const KEYS = [
  "OPENCOMPANY_DEPLOY_PROVIDER",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
] as const;

/** Run with a clean, explicit deployment environment, then restore it. */
function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("a fresh install has no deployment provider and says so", () => {
  withEnv({}, () => {
    const unavailable = externalActionAdapter("deployment_package");
    assert.equal(unavailable.configured, false);
    assert.equal(unavailable.id, "none");
    assert.match(unavailable.note, /No public deployment provider/i);
    assert.match(unavailable.note, /OPENCOMPANY_DEPLOY_PROVIDER=vercel/);
  });
});

test("Vercel is configured only when it is selected and has both ids", () => {
  withEnv({ OPENCOMPANY_DEPLOY_PROVIDER: "vercel", VERCEL_TOKEN: "test-token-value" }, () => {
    assert.equal(externalActionAdapter("deployment_package").configured, false);
  });
  withEnv({ OPENCOMPANY_DEPLOY_PROVIDER: "vercel", VERCEL_PROJECT_ID: "prj_test" }, () => {
    assert.equal(externalActionAdapter("deployment_package").configured, false);
  });
  withEnv(
    { OPENCOMPANY_DEPLOY_PROVIDER: "vercel", VERCEL_TOKEN: "test-token-value", VERCEL_PROJECT_ID: "prj_test" },
    () => {
      const configured = externalActionAdapter("deployment_package");
      assert.equal(configured.configured, true);
      assert.equal(configured.id, "vercel");
      assert.doesNotMatch(configured.note, /test-token-value/);
    },
  );
});

test("an unsupported deployment provider fails closed", () => {
  withEnv({ OPENCOMPANY_DEPLOY_PROVIDER: "unknown-host" }, () => {
    const adapter = externalActionAdapter("deployment_package");
    assert.equal(adapter.configured, false);
    assert.match(adapter.note, /No adapter is installed/i);
  });
});
