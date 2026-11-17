import { getConfig } from "@/lib/config";

/**
 * Coolify as this installation's deployment centre.
 *
 * "In place" is the whole point. Coolify owns exactly one application — one uuid,
 * one public domain, one data volume — and a deployment rebuilds the image for
 * that same application. The site is therefore served by one copy before, during
 * and after an update: the old container is replaced, never joined by a second
 * one. Nothing in this module creates, clones or deletes an application. An
 * adapter that publishes a second copy gives the company two databases behind one
 * domain, which is exactly what went wrong when a mirror was built here before.
 *
 * The token stays server-side. The browser only ever sees the console's own API.
 */
export type CoolifyProvider = {
  /** Base URL without a trailing slash, e.g. http://192.168.1.113:8000 */
  baseUrl: string;
  token: string;
  /** Application uuid in Coolify, not the name. */
  appUuid: string;
  appName: string;
};

export type CoolifySnapshot = {
  name: string;
  status: string;
  url: string;
};

export type CoolifyUpdateResult =
  | { ok: true; url: string; status: string; reachable: boolean; deploymentUuid: string | null }
  | { ok: false; reason: string };

const POLL_INTERVAL_MS = 5_000;
/** A rebuild pulls base images and compiles: three minutes was not enough. */
const POLL_DEADLINE_MS = 20 * 60_000;
const TERMINAL_STATES = new Set(["finished", "failed", "cancelled", "cancelled-with-warnings"]);

export function coolifyProvider(): CoolifyProvider {
  return getConfig().deployment.coolify;
}

export function coolifyConfigured(provider: CoolifyProvider = coolifyProvider()): boolean {
  return Boolean(provider.baseUrl && provider.token && provider.appUuid);
}

/** What is missing, or what the configured application is, in one sentence. */
export function coolifyNote(provider: CoolifyProvider = coolifyProvider()): string {
  if (!provider.baseUrl) {
    return "No deployment centre is configured. Set COOLIFY_BASE_URL, COOLIFY_TOKEN and COOLIFY_APP_UUID to let Coolify update the running application in place.";
  }
  if (!provider.token) {
    return `Coolify is at ${provider.baseUrl} but COOLIFY_TOKEN is not set, so the console cannot ask it anything.`;
  }
  if (!provider.appUuid) {
    return `Set COOLIFY_APP_UUID to the uuid of the Coolify application that runs "${provider.appName}". Updates rebuild that one application; no second copy is created.`;
  }
  return `Coolify at ${provider.baseUrl} owns application ${provider.appUuid} ("${provider.appName}"). An update rebuilds that same application — same domain, same data volume — so one copy serves the site before, during and after.`;
}

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
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

/** Coolify lists several domains as a comma-separated fqdn string. */
function splitDomains(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return splitDomains(JSON.parse(trimmed) as unknown);
      } catch {
        return [];
      }
    }
    return trimmed.split(",").map((entry) => entry.trim());
  }
  if (Array.isArray(value)) return value.flatMap(splitDomains);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((service) =>
      service && typeof service === "object"
        ? splitDomains((service as { domain?: unknown }).domain)
        : splitDomains(service),
    );
  }
  return [];
}

/**
 * A plain application keeps its domains in `fqdn`; a Docker Compose application
 * keeps them per service in `docker_compose_domains`. Reading only `fqdn` makes
 * every compose deployment look domainless.
 */
export function applicationUrl(fqdn: unknown, composeDomains?: unknown): string {
  const candidates = [...splitDomains(fqdn), ...splitDomains(composeDomains)];
  return candidates.find((entry) => entry.startsWith("http")) ?? "";
}

/** The running application as Coolify reports it, or null when it cannot be read. */
export async function applicationSnapshot(
  provider: CoolifyProvider = coolifyProvider(),
): Promise<CoolifySnapshot | null> {
  if (!coolifyConfigured(provider)) return null;
  try {
    const app = await call(provider, `/applications/${encodeURIComponent(provider.appUuid)}`, {}, 15_000);
    if (!app.ok) return null;
    const body = JSON.parse(app.body) as {
      name?: string;
      fqdn?: string;
      status?: string;
      docker_compose_domains?: string | null;
    };
    return {
      name: body.name ?? provider.appName,
      status: body.status ?? "unknown",
      url: applicationUrl(body.fqdn, body.docker_compose_domains),
    };
  } catch {
    return null;
  }
}

/** Queue a rebuild of the configured application. No application is created. */
export async function triggerInPlaceUpdate(
  provider: CoolifyProvider = coolifyProvider(),
): Promise<{ ok: true; deploymentUuid: string | null } | { ok: false; reason: string }> {
  if (!coolifyConfigured(provider)) return { ok: false, reason: coolifyNote(provider) };

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

  try {
    const parsed = JSON.parse(trigger.body) as {
      deployments?: { deployment_uuid?: string }[];
    };
    return { ok: true, deploymentUuid: parsed.deployments?.[0]?.deployment_uuid ?? null };
  } catch {
    return { ok: true, deploymentUuid: null };
  }
}

/**
 * Queue the in-place rebuild, wait for Coolify to finish it, then ask the
 * application's own domain once whether the updated copy answers.
 */
export async function updateInPlace(
  provider: CoolifyProvider = coolifyProvider(),
): Promise<CoolifyUpdateResult> {
  const queued = await triggerInPlaceUpdate(provider);
  if (!queued.ok) return queued;
  const { deploymentUuid } = queued;

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

  const snapshot = await applicationSnapshot(provider);
  if (snapshot?.status) state = snapshot.status;
  const url = snapshot?.url ?? "";
  if (!url) {
    return {
      ok: false,
      reason: `Coolify accepted the update (${state}) but application ${provider.appUuid} reports no public domain.`,
    };
  }

  let reachable = false;
  try {
    const page = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    reachable = page.ok;
  } catch {
    reachable = false;
  }

  return { ok: true, url, status: state, reachable, deploymentUuid };
}

/**
 * What the console shows about the deployment centre: who owns the running copy,
 * where it is, and what an update would do.
 */
export type DeploymentCenter = {
  id: "coolify" | "none";
  configured: boolean;
  note: string;
  live: CoolifySnapshot | null;
};

export async function deploymentCenter(): Promise<DeploymentCenter> {
  const provider = coolifyProvider();
  if (!coolifyConfigured(provider)) {
    return { id: "none", configured: false, note: coolifyNote(provider), live: null };
  }
  return { id: "coolify", configured: true, note: coolifyNote(provider), live: await applicationSnapshot(provider) };
}
