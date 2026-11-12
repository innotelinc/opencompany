import { deploymentFeed, recordDeployEvent } from "@/lib/domain/deployments";
import { fail, ok, readJson, unexpected } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The deployment timeline: this host's deploys plus Coolify's, newest first. */
export async function GET() {
  try {
    getSession();
    return Response.json(await deploymentFeed(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * Deploy scripts post here so a deployment shows up in the console the moment it
 * starts, not when someone thinks to look. Only the shape is validated: the
 * writers are root-owned scripts on the same host, and the values they send are a
 * commit sha and a status word.
 */
export async function POST(request: Request) {
  try {
    getSession();
    const body = await readJson<{
      source?: string;
      phase?: string;
      status?: string;
      commit?: string;
      detail?: string;
    }>(request);

    if (!body.commit || !/^[0-9a-f]{7,40}$/i.test(body.commit)) {
      return fail("Send the commit sha that was deployed.");
    }
    if (body.phase !== "start" && body.phase !== "finish") {
      return fail('phase must be "start" or "finish".');
    }

    const recorded = recordDeployEvent({
      at: new Date().toISOString(),
      source: body.source === "coolify" ? "coolify" : "box",
      phase: body.phase,
      status: body.status?.slice(0, 40) || (body.phase === "start" ? "started" : "succeeded"),
      commit: body.commit.toLowerCase(),
      detail: body.detail?.slice(0, 200),
    });
    if (!recorded) return fail("Could not record the deployment event.", 500);
    return ok({ recorded: true });
  } catch (error) {
    return unexpected(error);
  }
}
