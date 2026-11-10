import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import {
  getCompanyBySlug,
  getDeliverableByName,
  latestDeliverableVersion,
  listDeliverableVersions,
} from "@/lib/domain/repo";
import { resolveArtifactFile } from "@/lib/engine/artifacts";
import { rewritePublicUrls } from "@/lib/public-site/rewrite-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_SITE_NAME = "OpenCompany public site";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

const FALLBACK = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCompany — public site in progress</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: #f7f4ee; color: #16201c;
      font-family: "Iowan Old Style", Georgia, serif; }
    main { max-width: 34rem; padding: 2rem; }
    h1 { font-size: 2rem; color: #1f3d34; margin: 0 0 0.75rem; }
    p { line-height: 1.6; color: #57645e; }
    code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  </style>
</head>
<body>
  <main>
    <h1>The public site is being built.</h1>
    <p>A public site developer is preparing the first reviewed version. This page
    appears here as soon as the deliverable passes its automated checks.</p>
    <p><code>Public site: improvement pass</code> runs on a recurring routine.</p>
  </main>
</body>
</html>`;

/**
 * The company's public face. Unlike /api/preview, this route does not require
 * the owner session: it serves the latest checked version of the company's own
 * site. It is still served by this application, not published externally.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const config = getConfig();
  const company = getCompanyBySlug(config.companySlug);
  if (!company) {
    return new Response("Company not configured", { status: 503 });
  }
  const { path: segments } = await context.params;
  const relative = (segments ?? []).join("/") || "index.html";

  const deliverable = getDeliverableByName(company.id, PUBLIC_SITE_NAME);
  let version = deliverable ? latestDeliverableVersion(company.id, deliverable.id) : null;
  // A failed improvement pass must not take the public site down; keep serving
  // the newest artifact that actually passed its checks.
  if (deliverable && (!version || !version.checksPassed)) {
    version = listDeliverableVersions(company.id, deliverable.id).find((candidate) => candidate.checksPassed) ?? null;
  }
  if (!version || !version.checksPassed) {
    return new Response(FALLBACK, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const target = resolveArtifactFile(version.artifactPath, relative);
  if (!target) return new Response("Not found", { status: 404 });

  const ext = path.extname(target).toLowerCase();
  const body =
    ext === ".html"
      ? rewritePublicUrls(fs.readFileSync(target, "utf8"), relative)
      : fs.readFileSync(target);
  return new Response(body, {
    headers: {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=30",
      "content-security-policy":
        "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}
