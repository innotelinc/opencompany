import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listActivity, listActivityBefore, listRunEvents } from "@/lib/domain/repo";
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
 * `?limit=` (1–500, default 40) sets the page size. Two ways to ask for the next
 * page back:
 *
 *   ?cursor=<nextCursor>   stable. Prefer this: new events arriving between calls
 *                          cannot shift the window, so nothing repeats or is missed.
 *   ?offset=<n>            simpler, but the window moves as events land.
 *
 * A cursor is opaque — pass back exactly what `nextCursor` gave you. `before` and
 * `beforeId` are the readable form of the same thing, if you would rather build it.
 * Rows are shaped by activityView, the same function the Activity panel renders.
 */
export async function GET(request: Request) {
  try {
    const session = getSession();
    const url = new URL(request.url);
    const params = url.searchParams;

    const rawLimit = params.get("limit");
    let limit = DEFAULT_LIMIT;
    if (rawLimit !== null) {
      const parsed = Number(rawLimit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return fail(`limit must be a whole number between 1 and ${MAX_LIMIT}.`);
      }
      limit = parsed;
    }

    let beforeIso: string | null = null;
    let beforeId: string | null = null;

    const cursor = params.get("cursor");
    if (cursor) {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      const separator = decoded.indexOf("|");
      const iso = separator > 0 ? decoded.slice(0, separator) : "";
      const id = separator > 0 ? decoded.slice(separator + 1) : "";
      if (!iso || !id || !Number.isFinite(Date.parse(iso))) {
        return fail("cursor is not one this endpoint issued.");
      }
      beforeIso = new Date(Date.parse(iso)).toISOString();
      beforeId = id;
    } else if (params.get("before")) {
      const at = Date.parse(params.get("before") as string);
      if (!Number.isFinite(at)) return fail("before must be an ISO timestamp.");
      beforeIso = new Date(at).toISOString();
      beforeId = params.get("beforeId") || null;
    }

    let offset = 0;
    if (!beforeIso && params.get("offset") !== null) {
      const parsed = Number(params.get("offset"));
      if (!Number.isInteger(parsed) || parsed < 0) {
        return fail("offset must be a whole number of events, 0 or more.");
      }
      offset = parsed;
    }

    // One extra row tells us whether there is another page without a count query.
    const rows = beforeIso
      ? listActivityBefore(session.company.id, beforeIso, beforeId, limit + 1)
      : listActivity(session.company.id, limit + 1, offset);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1] ?? null;

    return NextResponse.json({
      ok: true,
      // Same shape the Activity panel renders: byline, text and formatted policy values.
      activity: activityViews(page),
      limit,
      offset: beforeIso ? null : offset,
      nextOffset: !beforeIso && hasMore ? offset + page.length : null,
      nextBefore: hasMore ? last?.createdAt ?? null : null,
      nextBeforeId: hasMore ? last?.id ?? null : null,
      nextCursor: hasMore && last ? Buffer.from(`${last.createdAt}|${last.id}`).toString("base64url") : null,
      runEvents: listRunEvents(session.company.id, { limit: 40 }),
      worker: workerStatus(),
      halted: session.company.haltedAt,
    });
  } catch (error) {
    return unexpected(error);
  }
}
