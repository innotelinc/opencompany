import type { ActivityEvent } from "@/lib/domain/types";
import { relativeTime } from "@/lib/time";

export interface PolicyChangeView {
  key: string;
  /** Already formatted the way the feed shows it, e.g. "$12,000.00 (1200000¢)". */
  from: string;
  to: string;
  note: string | null;
}

export interface ActivityView {
  id: string;
  type: string;
  actorType: ActivityEvent["actorType"];
  actorId: string | null;
  /** "5m ago · system" — the line above the row. */
  byline: string;
  /** What the row says: the policy key for a change, otherwise the summary. */
  text: string;
  summary: string;
  policy: PolicyChangeView | null;
  payload: Record<string, unknown>;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Cents read as dollars, switches read as on/off, everything else stays literal. */
export function formatPolicyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") {
    return key.endsWith("_cents") ? `${dollars(value)} (${value}¢)` : String(value);
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * One event, shaped for reading.
 *
 * The feed and /api/activity both go through this, so the API returns the values
 * the screen shows rather than raw payload fields the caller has to interpret.
 */
export function activityView(event: ActivityEvent): ActivityView {
  const payload = event.payload as { key?: unknown; from?: unknown; to?: unknown; note?: unknown };
  const key = typeof payload.key === "string" ? payload.key : null;
  const policy: PolicyChangeView | null = key
    ? {
        key,
        from: formatPolicyValue(key, payload.from),
        to: formatPolicyValue(key, payload.to),
        note: typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null,
      }
    : null;

  return {
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    byline: `${relativeTime(event.createdAt)} · ${event.actorType}`,
    text: policy ? policy.key : event.summary,
    summary: event.summary,
    policy,
    payload: event.payload,
    taskId: event.taskId,
    projectId: event.projectId,
    createdAt: event.createdAt,
  };
}

export function activityViews(events: ActivityEvent[]): ActivityView[] {
  return events.map(activityView);
}
