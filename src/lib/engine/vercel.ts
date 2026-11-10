/**
 * Vercel deployment for approved artifacts. The worker calls the REST API
 * directly — no CLI, no token in the browser. Approval, hashing and the
 * exactly-once claim all happen before this module is reached.
 */
type PublishableFiles = Map<string, string>;

export type VercelPublishResult =
  | { ok: true; url: string; readyState: string; reachable: boolean }
  | { ok: false; reason: string };

const API = "https://api.vercel.com";

function teamQuery(teamId: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

export async function publishToVercel(
  files: PublishableFiles,
  provider: { token: string; projectId: string; teamId: string; projectName: string },
): Promise<VercelPublishResult> {
  if (files.size === 0) return { ok: false, reason: "The approved artifact contains no files." };
  const payload = {
    name: provider.projectName,
    project: provider.projectId,
    target: "production",
    files: [...files.entries()].map(([file, body]) => ({
      file,
      data: Buffer.from(body, "utf8").toString("base64"),
    })),
  };

  const query = teamQuery(provider.teamId);
  const created = await fetch(`${API}/v13/deployments${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await created.text();
  if (!created.ok) {
    return { ok: false, reason: `Vercel returned ${created.status}: ${body.slice(0, 300)}` };
  }

  let deployment: { id?: string; url?: string; readyState?: string };
  try {
    deployment = JSON.parse(body);
  } catch {
    return { ok: false, reason: "Vercel returned an unreadable deployment response." };
  }
  const url = deployment.url ? `https://${deployment.url}` : "";
  if (!url) return { ok: false, reason: "Vercel accepted the upload but returned no URL." };

  // Wait for the deployment to finish building so "succeeded" means published.
  let readyState = deployment.readyState ?? "QUEUED";
  const deadline = Date.now() + 60_000;
  while (deployment.id && readyState !== "READY" && readyState !== "ERROR" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const status = await fetch(`${API}/v13/deployments/${deployment.id}${query}`, {
      headers: { Authorization: `Bearer ${provider.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!status.ok) break;
    const state = (await status.json()) as { readyState?: string };
    readyState = state.readyState ?? readyState;
  }
  if (readyState === "ERROR" || readyState === "CANCELED") {
    return { ok: false, reason: `Vercel deployment ended in ${readyState}.` };
  }

  let reachable = false;
  try {
    const page = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    reachable = page.ok;
  } catch {
    reachable = false;
  }
  return { ok: true, url, readyState, reachable };
}
