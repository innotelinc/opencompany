import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { originFromHeaders, pkcePair, redirectUri, safeNext, verifyIdToken } from "../src/lib/sso";

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "test-key" };

function token(claims: Record<string, unknown>, kid = "test-key"): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(claims));
  const signer = createSign("sha256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${b64url(signer.sign(privateKey))}`;
}

const valid = {
  iss: "https://auth.example/application/o/openco/",
  aud: "openco",
  exp: Math.floor(Date.now() / 1000) + 300,
  nonce: "nonce-value",
  email: "owner@openco.innotel.tech",
};

const options = { issuer: valid.iss, clientId: "openco", nonce: "nonce-value", jwks: { keys: [jwk] } };

test("the PKCE challenge is the hash of the verifier", () => {
  const { verifier, challenge } = pkcePair();
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
  assert.notEqual(pkcePair().verifier, verifier);
});

test("only a local path is accepted as the place to land after sign-in", () => {
  assert.equal(safeNext("/projects/7"), "/projects/7");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext(undefined), "/");
});

test("a token this application asked for verifies", async () => {
  const claims = await verifyIdToken(token(valid), options);
  assert.equal(claims.email, "owner@openco.innotel.tech");
});

test("a token for another sign-in is refused", async () => {
  await assert.rejects(() => verifyIdToken(token({ ...valid, nonce: "other" }), options), /does not belong/);
});

test("a token for another application is refused", async () => {
  await assert.rejects(() => verifyIdToken(token({ ...valid, aud: "someone-else" }), options), /another application/);
});

test("an expired token is refused", async () => {
  await assert.rejects(
    () => verifyIdToken(token({ ...valid, exp: Math.floor(Date.now() / 1000) - 600 }), options),
    /expired/,
  );
});

test("a token from another issuer is refused", async () => {
  await assert.rejects(
    () => verifyIdToken(token({ ...valid, iss: "https://auth.example/application/o/other/" }), options),
    /another issuer/,
  );
});

test("a tampered token fails its signature", async () => {
  const [header, , signature] = token(valid).split(".");
  const forged = b64url(JSON.stringify({ ...valid, email: "attacker@example.com" }));
  await assert.rejects(
    () => verifyIdToken(`${header}.${forged}.${signature}`, options),
    /signature does not verify/,
  );
});

test("an unsigned token is refused outright", async () => {
  const none = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = b64url(JSON.stringify(valid));
  await assert.rejects(() => verifyIdToken(`${none}.${body}.`, options), /unsupported signature/);
});

test("the sign-in returns to the hostname the browser used", () => {
  assert.equal(
    originFromHeaders(new Headers({ host: "opencompany.innotel.site", "x-forwarded-proto": "https" })),
    "https://opencompany.innotel.site",
  );
  assert.equal(originFromHeaders(new Headers({ host: "openco.innotel.tech:8443" })), "https://openco.innotel.tech:8443");
});

test("the forwarded name wins over the internal one behind a proxy", () => {
  const headers = new Headers({
    host: "192.168.1.52:3001",
    "x-forwarded-host": "openco.innotel.tech",
    "x-forwarded-proto": "https",
  });
  assert.equal(originFromHeaders(headers), "https://openco.innotel.tech");
});

test("a loopback, private or service name is not a public origin", () => {
  const hosts = ["localhost:3000", "127.0.0.1:3000", "192.168.1.52:3001", "10.0.4.9", "172.20.0.2", "opencompany:3000"];
  for (const host of hosts) assert.equal(originFromHeaders(new Headers({ host })), null, host);
});

test("the callback address follows the request, falling back to the configuration", () => {
  const config = {
    issuer: "https://auth.example/application/o/openco/",
    clientId: "openco",
    clientSecret: "secret",
    publicUrl: "https://openco.innotel.tech",
    allowedEmails: ["owner@example.com"],
  };
  assert.equal(redirectUri(config), "https://openco.innotel.tech/api/auth/sso/callback");
  assert.equal(redirectUri(config, null), "https://openco.innotel.tech/api/auth/sso/callback");
  assert.equal(
    redirectUri(config, "https://opencompany.innotel.site/"),
    "https://opencompany.innotel.site/api/auth/sso/callback",
  );
});
