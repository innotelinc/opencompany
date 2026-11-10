import fs from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/session";
import { getDeliverable, latestDeliverableVersion } from "@/lib/domain/repo";
import { resolveArtifactFile } from "@/lib/engine/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Serves an immutable deliverable version from inside the company's artifact
 * directory. This is a private, loopback-style preview — not a deployment.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ deliverableId: string; path?: string[] }> },
) {
  const session = getSession();
  const { deliverableId, path: segments } = await context.params;
  const deliverable = getDeliverable(session.company.id, deliverableId);
  if (!deliverable) return new Response("Not found", { status: 404 });
  const version = latestDeliverableVersion(session.company.id, deliverable.id);
  if (!version) return new Response("No version available", { status: 404 });
  const relative = (segments ?? []).join("/") || version.entryFile;
  const target = resolveArtifactFile(version.artifactPath, relative);
  if (!target) return new Response("Not found in deliverable", { status: 404 });
  const body = fs.readFileSync(target);
  const ext = path.extname(target).toLowerCase();
  return new Response(body, {
    headers: {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "private, no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline' 'self'; img-src 'self' data:; font-src 'self'; form-action 'none'; base-uri 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}
