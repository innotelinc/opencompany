import assert from "node:assert/strict";
import test from "node:test";
import { applicationUrl } from "../src/lib/engine/coolify";
import { externalActionAdapter } from "../src/lib/engine/external";

const KEYS = [
  "OPENCOMPANY_DEPLOY_PROVIDER",
  "COOLIFY_BASE_URL",
  "COOLIFY_TOKEN",
  "COOLIFY_APP_UUID",
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

test("a fresh install deploys through Coolify, not Vercel", () => {
  withEnv({}, () => {
    const unavailable = externalActionAdapter("deployment_package");
    assert.equal(unavailable.configured, false);
    assert.equal(unavailable.id, "coolify");
    assert.match(unavailable.note, /No public deployment provider/i);
    assert.match(unavailable.note, /COOLIFY_TOKEN/);
    assert.doesNotMatch(unavailable.note, /VERCEL_TOKEN/);
  });
});

test("a configured Coolify app reports ready without leaking the token", () => {
  withEnv({ COOLIFY_TOKEN: "coolify-token-value", COOLIFY_APP_UUID: "app_uuid_1" }, () => {
    const configured = externalActionAdapter("deployment_package");
    assert.equal(configured.configured, true);
    assert.equal(configured.id, "coolify");
    assert.match(configured.note, /deploy\.innotel\.us/);
    assert.doesNotMatch(configured.note, /coolify-token-value/);
  });
});

test("Coolify needs both the token and the application uuid", () => {
  withEnv({ COOLIFY_TOKEN: "coolify-token-value" }, () => {
    assert.equal(externalActionAdapter("deployment_package").configured, false);
  });
  withEnv({ COOLIFY_APP_UUID: "app_uuid_1" }, () => {
    assert.equal(externalActionAdapter("deployment_package").configured, false);
  });
});

test("Vercel still works when explicitly selected", () => {
  withEnv({ OPENCOMPANY_DEPLOY_PROVIDER: "vercel", VERCEL_TOKEN: "test-token-value", VERCEL_PROJECT_ID: "prj_test" }, () => {
    const configured = externalActionAdapter("deployment_package");
    assert.equal(configured.configured, true);
    assert.equal(configured.id, "vercel");
    assert.doesNotMatch(configured.note, /test-token-value/);
  });
});

test("a compose application's domain comes from its service map", () => {
  assert.equal(
    applicationUrl(null, '{"web":{"domain":"http://opencompany.73.68.203.71.sslip.io"}}'),
    "http://opencompany.73.68.203.71.sslip.io",
  );
  assert.equal(
    applicationUrl("https://plain.example"),
    "https://plain.example",
    "a plain application still reads fqdn",
  );
  assert.equal(applicationUrl(null, null), "");
  assert.equal(applicationUrl(null, "not-json{"), "");
});

test("an unsupported deployment provider fails closed", () => {
  withEnv({ OPENCOMPANY_DEPLOY_PROVIDER: "unknown-host" }, () => {
    const adapter = externalActionAdapter("deployment_package");
    assert.equal(adapter.configured, false);
    assert.match(adapter.note, /No adapter is installed/i);
  });
});
