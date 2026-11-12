/**
 * Coolify deployment for approved artifacts. The worker calls Coolify's REST API
 * directly — no CLI, and the token never reaches the browser. Approval, hashing
 * and the exactly-once claim all happen before this module is reached.
 *
 * Coolify publishes from its own sources (git or image), so it cannot be handed
 * the artifact files themselves. What this adapter does is trigger a deployment
 * of the application the owner configured, wait for it to finish, then prove the
 * public URL answers. The assembled package stays on disk next to
 * DEPLOYMENT.md for the audit trail, so the approval still describes exactly
 * what was reviewed.
 */
type PublishableFiles = Map<string, string>;

export type CoolifyProvider = {
  /** Coolify base URL without a trailing slash, e.g. https://deploy.innotel.us */
  baseUrl: string;
  token: string;
  /** Application uuid in Coolify, not the name. */
  appUuid: string;
  projectName: string;
};

export type CoolifyPublishResult =
  | { ok: true; url: string; status: string; reachable: boolean; deploymentUuid: string | null }
  | { ok: false; reason: string };

const POLL_INTERVAL_MS = 5_000;
const POLL_DEADLINE_MS = 180_000;
const TERMINAL_STATES = new Set(["finished", "failed", "cancelled", "cancelled-with-warnings"]);

async function call(
  provider: CoolifyProvider,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(`${provider.baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${provider.token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

/** Coolify lists several domains as a comma-separated fqdn string. */
function publicUrl(fqdn: unknown): string {
  const first = String(fqdn ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("http"));
  return first ?? "";
}

export async function publishToCoolify(
  files: PublishableFiles,
  provider: CoolifyProvider,
): Promise<CoolifyPublishResult> {
  if (files.size === 0) return { ok: false, reason: "The approved artifact contains no files." };
  if (!provider.token) return { ok: false, reason: "COOLIFY_TOKEN is not set." };
  if (!provider.appUuid) return { ok: false, reason: "COOLIFY_APP_UUID is not set." };

  // Trigger. Coolify answers a deployment POST with the queued deployment uuid.
  let trigger: { ok: boolean; status: number; body: string };
  try {
    trigger = await call(provider, `/deploy?uuid=${encodeURIComponent(provider.appUuid)}&force=false`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (error) {
    return { ok: false, reason: `Coolify is unreachable at ${provider.baseUrl}: ${String(error)}` };
  }
  if (!trigger.ok) {
    return { ok: false, reason: `Coolify returned ${trigger.status}: ${trigger.body.slice(0, 300)}` };
  }

  let deploymentUuid: string | null = null;
  try {
    const parsed = JSON.parse(trigger.body) as {
      deployments?: { deployment_uuid?: string; resource_uuid?: string }[];
    };
    deploymentUuid = parsed.deployments?.[0]?.deployment_uuid ?? null;
  } catch {
    deploymentUuid = null;
  }

  // Wait for the deployment to reach a terminal state, when Coolify told us
  // which deployment to watch.
  let state = "queued";
  if (deploymentUuid) {
    const deadline = Date.now() + POLL_DEADLINE_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const polled = await call(provider, `/deployments/${deploymentUuid}`, {}, 15_000);
        if (!polled.ok) break;
        const body = JSON.parse(polled.body) as { status?: string };
        state = body.status ?? state;
      } catch {
        break;
      }
      if (TERMINAL_STATES.has(state)) break;
    }
    if (state === "failed" || state === "cancelled" || state === "cancelled-with-warnings") {
      return { ok: false, reason: `Coolify deployment ${deploymentUuid} ended as ${state}.` };
    }
  }

  // The application's domains are the published surface; check it answers.
  let url = "";
  try {
    const app = await call(provider, `/applications/${encodeURIComponent(provider.appUuid)}`, {}, 15_000);
    if (app.ok) {
      const body = JSON.parse(app.body) as { fqdn?: string; status?: string };
      url = publicUrl(body.fqdn);
      if (body.status) state = body.status;
    }
  } catch {
    url = "";
  }

  let reachable = false;
  if (url) {
    try {
      const page = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      reachable = page.ok;
    } catch {
      reachable = false;
    }
  }

  if (!url) {
    return {
      ok: false,
      reason: `Coolify accepted the deployment (${state}) but the application reports no public domain.`,
    };
  }
  return { ok: true, url, status: state, reachable, deploymentUuid };
}
