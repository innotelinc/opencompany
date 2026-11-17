import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
import { getConfig } from "@/lib/config";

/**
 * Sign-in through Cerulean's Authentik.
 *
 * The console no longer asks for a password of its own: it sends the browser to
 * Authentik, which authenticates the person, and comes back with a signed identity
 * token. Only a token that this application asked for is accepted — the nonce and
 * PKCE verifier live in a short-lived HttpOnly cookie, so a token minted for another
 * application or another browser cannot be replayed here.
 *
 * Configured entirely from the environment; when the three Authentik values are
 * absent the console falls back to its own password form (local development).
 */
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export const SSO_STATE_COOKIE = "oc_sso";
export const SSO_STATE_TTL_SECONDS = 10 * 60;

export interface SsoConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  /** Addresses allowed to open the console, lower-cased. */
  allowedEmails: string[];
}

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export function getSsoConfig(): SsoConfig | null {
  const issuer = process.env.AUTHENTIK_ISSUER_URL?.trim();
  const clientId = process.env.AUTHENTIK_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) return null;

  const publicUrl = (process.env.OPENCO_PUBLIC_URL?.trim() || "https://openco.innotel.tech").replace(/\/+$/, "");
  const allowed = (process.env.OPENCO_SSO_ALLOWED_EMAILS ?? getConfig().ownerEmail)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return {
    issuer: `${issuer.replace(/\/+$/, "")}/`,
    clientId,
    clientSecret,
    publicUrl,
    allowedEmails: allowed.length > 0 ? allowed : [getConfig().ownerEmail.toLowerCase()],
  };
}

export function redirectUri(config: SsoConfig): string {
  return `${config.publicUrl}/api/auth/sso/callback`;
}

let discoveryCache: { key: string; at: number; value: Discovery } | null = null;

export async function discover(config: SsoConfig): Promise<Discovery> {
  if (discoveryCache && discoveryCache.key === config.issuer && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.value;
  }
  const response = await fetch(`${config.issuer}.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`The identity provider could not be reached (${response.status}).`);
  }
  const value = (await response.json()) as Discovery;
  discoveryCache = { key: config.issuer, at: Date.now(), value };
  return value;
}

let jwksCache: { key: string; at: number; value: { keys: JsonWebKey[] } } | null = null;

export async function loadJwks(uri: string): Promise<{ keys: JsonWebKey[] }> {
  if (jwksCache && jwksCache.key === uri && Date.now() - jwksCache.at < DISCOVERY_TTL_MS) return jwksCache.value;
  const response = await fetch(uri, { cache: "no-store" });
  if (!response.ok) throw new Error(`The identity provider's keys could not be read (${response.status}).`);
  const value = (await response.json()) as { keys: JsonWebKey[] };
  jwksCache = { key: uri, at: Date.now(), value };
  return value;
}

/** A PKCE pair: the browser keeps the verifier, the provider sees only its hash. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export interface SsoState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export function newState(next: string | null | undefined): SsoState {
  return {
    state: randomBytes(16).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
    verifier: pkcePair().verifier,
    next: safeNext(next),
  };
}

/** Only a path on this application is a safe place to land after sign-in. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export function encodeState(state: SsoState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeState(value: string | undefined): SsoState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SsoState;
    if (!parsed.state || !parsed.nonce || !parsed.verifier) return null;
    return { ...parsed, next: safeNext(parsed.next) };
  } catch {
    return null;
  }
}

export function authorizeUrl(config: SsoConfig, discovery: Discovery, state: SsoState): string {
  const challenge = createHash("sha256").update(state.verifier).digest("base64url");
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(config));
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state.state);
  url.searchParams.set("nonce", state.nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface VerifiedClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  nonce?: string;
}

/**
 * Check a token the provider signed: its signature against the published keys, and
 * that it was issued by this provider, for this application, still valid, and in
 * answer to this very sign-in.
 */
export async function verifyIdToken(
  idToken: string,
  options: { issuer: string; clientId: string; nonce: string; jwks: { keys: JsonWebKey[] } },
): Promise<VerifiedClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("The identity token is malformed.");

  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error("The identity token uses an unsupported signature.");

  const jwk =
    options.jwks.keys.find((candidate) => (candidate as { kid?: string }).kid === header.kid) ?? options.jwks.keys[0];
  if (!jwk) throw new Error("The identity token's signing key is not published.");

  const key = createPublicKey({ key: jwk as unknown as import("node:crypto").JsonWebKey, format: "jwk" });
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  if (!verifySignature("sha256", signed, key, Buffer.from(parts[2], "base64url"))) {
    throw new Error("The identity token's signature does not verify.");
  }

  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as VerifiedClaims;

  if (claims.iss !== options.issuer) throw new Error("The identity token came from another issuer.");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(options.clientId)) throw new Error("The identity token was issued for another application.");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now() - CLOCK_SKEW_MS) {
    throw new Error("The identity token has expired.");
  }
  if (claims.nonce !== options.nonce) throw new Error("The identity token does not belong to this sign-in.");

  return claims;
}

/** Exchange the one-time code for tokens, authenticating as this application. */
export async function exchangeCode(
  config: SsoConfig,
  discovery: Discovery,
  code: string,
  verifier: string,
): Promise<{ id_token?: string; access_token?: string }> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(config),
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The identity provider refused the sign-in (${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""}).`);
  }
  return (await response.json()) as { id_token?: string; access_token?: string };
}
