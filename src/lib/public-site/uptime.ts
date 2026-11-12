import { getPolicies, setPolicy } from "@/lib/domain/repo";

/**
 * Availability of the company's public site.
 *
 * The site is meant to be up continuously, so "is it answering" is a fact we can
 * check rather than a claim an employee makes. The probe is deliberately modest:
 * one GET, a timeout, and a check that the response is not the holding page that
 * is served before any checked version exists.
 */
export interface PublicSiteProbe {
  url: string;
  ok: boolean;
  status: number | null;
  responseMs: number;
  checkedAt: string;
  detail: string;
}

export const PUBLIC_SITE_PROBE_POLICY = "public_site.last_probe";
const TIMEOUT_MS = 15_000;
const HOLDING_PAGE = /public site is being built/i;

/** The URL to watch. Defaults to this application's own /site route. */
export function publicSiteUrl(): string {
  const configured = process.env.OPENCOMPANY_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;
  const port = process.env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}/site`;
}

export async function probePublicSite(url: string = publicSiteUrl()): Promise<PublicSiteProbe> {
  const started = Date.now();
  const base = { url, checkedAt: new Date().toISOString() };
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    const responseMs = Date.now() - started;
    if (HOLDING_PAGE.test(body)) {
      return {
        ...base,
        ok: false,
        status: response.status,
        responseMs,
        detail: "Serving the holding page: no checked version has been published yet.",
      };
    }
    if (!response.ok) {
      return { ...base, ok: false, status: response.status, responseMs, detail: `Responded ${response.status}.` };
    }
    return {
      ...base,
      ok: true,
      status: response.status,
      responseMs,
      detail: `Answered ${response.status} in ${responseMs} ms.`,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: null,
      responseMs: Date.now() - started,
      detail: `No answer: ${String(error)}`,
    };
  }
}

/** Keep the newest probe in company policy so the UI and the worker agree on it. */
export function rememberProbe(companyId: string, probe: PublicSiteProbe): void {
  setPolicy(companyId, PUBLIC_SITE_PROBE_POLICY, probe, "Last availability probe of the public site.");
}

export function lastProbe(companyId: string): PublicSiteProbe | null {
  const stored = getPolicies(companyId)[PUBLIC_SITE_PROBE_POLICY];
  if (!stored || typeof stored !== "object") return null;
  const probe = stored as Partial<PublicSiteProbe>;
  if (typeof probe.ok !== "boolean" || typeof probe.checkedAt !== "string") return null;
  return {
    url: String(probe.url ?? publicSiteUrl()),
    ok: probe.ok,
    status: typeof probe.status === "number" ? probe.status : null,
    responseMs: Number(probe.responseMs ?? 0),
    checkedAt: probe.checkedAt,
    detail: String(probe.detail ?? ""),
  };
}

/** Probe and record in one call; used by the health route and the routine. */
export async function checkPublicSite(companyId: string): Promise<PublicSiteProbe> {
  const probe = await probePublicSite();
  rememberProbe(companyId, probe);
  return probe;
}

