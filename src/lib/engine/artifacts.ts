import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { artifactsRoot, ensureDir } from "@/lib/computers/workspace";
import type { CheckResult, DeliverableManifestEntry } from "@/lib/domain/types";

/**
 * Deliverable artifacts are copied out of the (mutable) employee workspace into
 * a content-addressed, immutable version directory. Reviews, previews and
 * reports all read this copy, so later workspace edits cannot rewrite history.
 */
export function persistFiles(input: {
  companyId: string;
  deliverableId: string;
  version: number;
  files: Map<string, string>;
}): { artifactPath: string; manifest: DeliverableManifestEntry[] } {
  const dir = path.join(artifactsRoot(input.companyId), input.deliverableId, `v${input.version}`);
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  const manifest: DeliverableManifestEntry[] = [];
  for (const [relative, contents] of input.files) {
    const safe = relative.replace(/\\/g, "/").replace(/^\/+/, "");
    if (safe.includes("..")) throw new Error(`Unsafe artifact path: ${relative}`);
    const target = path.join(dir, safe);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, contents, "utf8");
    manifest.push({
      path: safe,
      bytes: Buffer.byteLength(contents),
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    });
  }
  return { artifactPath: dir, manifest };
}

export function readArtifactFiles(artifactPath: string): Map<string, string> {
  const files = new Map<string, string>();
  if (!fs.existsSync(artifactPath)) return files;
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (fs.statSync(full).size < 1024 * 1024) files.set(rel, fs.readFileSync(full, "utf8"));
    }
  };
  walk(artifactPath, "");
  return files;
}

export function resolveArtifactFile(artifactPath: string, relative: string): string | null {
  const base = path.resolve(artifactPath);
  const target = path.resolve(base, relative || "index.html");
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

export function summarizeChecks(checks: CheckResult[]): string {
  return checks.map((check) => `${check.passed ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`).join("\n");
}
