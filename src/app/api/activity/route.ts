import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listActivity, listRunEvents } from "@/lib/domain/repo";
import { activityViews } from "@/lib/domain/activity-view";
import { workerStatus } from "@/lib/domain/ops";
import { fail, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 500;

/**
 * The activity trail, newest first.
 *
 * `?limit=` (1–500, default 40) and `?offset=` page back through the history.
 * `nextOffset` is the offset to ask for next, or null once the page is the last
 * one. The rows are shaped by activityView, the same function the panel renders.
 */
export async function GET(request: Request) {
  try {
    const session = getSession();
    const url = new URL(request.url);

    const rawLimit = url.searchParams.get("limit");
    const rawOffset = url.searchParams.get("offset");

    let limit = DEFAULT_LIMIT;
    if (rawLimit !== null) {
      const parsed = Number(rawLimit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return fail(`limit must be a whole number between 1 and ${MAX_LIMIT}.`);
      }
      limit = parsed;
    }

    let offset = 0;
    if (rawOffset !== null) {
      const parsed = Number(rawOffset);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return fail("offset must be a whole number of events, 0 or more.");
      }
      offset = parsed;
    }

    const events = listActivity(session.company.id, limit, offset);
    return NextResponse.json({
      ok: true,
      // Same shape the Activity panel renders: byline, text and formatted policy values.
      activity: activityViews(events),
      limit,
      offset,
      nextOffset: events.length === limit ? offset + events.length : null,
      runEvents: listRunEvents(session.company.id, { limit: 40 }),
      worker: workerStatus(),
      halted: session.company.haltedAt,
    });
  } catch (error) {
    return unexpected(error);
  }
}
