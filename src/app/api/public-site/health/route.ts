import { getConfig } from "@/lib/config";
import { getCompanyBySlug } from "@/lib/domain/repo";
import { checkPublicSite, lastProbe } from "@/lib/public-site/uptime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Availability of the public site, for outside monitors and for the owner's
 * console. Deliberately unauthenticated: it returns reachability and a timestamp
 * and nothing about the company's internals.
 */
export async function GET() {
  const config = getConfig();
  const company = getCompanyBySlug(config.companySlug);
  if (!company) {
    return Response.json({ ok: false, reason: "Company not configured." }, { status: 503 });
  }
  const probe = await checkPublicSite(company.id);
  return Response.json(
    { ok: probe.ok, site: probe },
    {
      status: probe.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}

/** Last recorded probe, without spending a request. */
export async function HEAD() {
  const config = getConfig();
  const company = getCompanyBySlug(config.companySlug);
  const probe = company ? lastProbe(company.id) : null;
  return new Response(null, {
    status: probe?.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
