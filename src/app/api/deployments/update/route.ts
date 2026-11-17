import { triggerInPlaceUpdate } from "@/lib/engine/coolify";
import { fail, ok, unexpected } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Update the running application in place.
 *
 * This queues a rebuild of the one Coolify application the console is configured
 * with: same uuid, same domain, same data volume. It does not create a second
 * application, and it does not wait for the rebuild — the browser is talking to the
 * very container that is about to be replaced, so the deployment's progress is
 * Coolify's to report and the page simply reconnects when the new copy is up.
 */
export async function POST() {
  try {
    await getSession();
    const queued = await triggerInPlaceUpdate();
    if (!queued.ok) return fail(queued.reason, 409);
    return ok({ queued: true, deploymentUuid: queued.deploymentUuid });
  } catch (error) {
    return unexpected(error);
  }
}
