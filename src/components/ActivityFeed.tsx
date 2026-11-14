import type { ActivityEvent } from "@/lib/domain/types";
import { Badge, Empty, relativeTime } from "@/components/ui";

/** Cents read as dollars, switches read as on/off, everything else stays literal. */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") {
    return key.endsWith("_cents") ? `$${(value / 100).toFixed(2)} (${value}¢)` : String(value);
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function PolicyChange({ event }: { event: ActivityEvent }) {
  const payload = event.payload as { key?: unknown; from?: unknown; to?: unknown; note?: unknown };
  // Older policy events predate the before/after payload; they keep their sentence.
  const key = typeof payload.key === "string" ? payload.key : null;
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  return (
    <div className="timeline-item policy">
      <div className="when">
        {relativeTime(event.createdAt)} · {event.actorType} <Badge tone="warn">policy</Badge>
      </div>
      {key ? (
        <>
          <div className="what mono">{key}</div>
          <div className="policy-change">
            <span className="was">{formatValue(key, payload.from)}</span>
            <span className="arrow">→</span>
            <span className="now">{formatValue(key, payload.to)}</span>
          </div>
          {note ? <div className="policy-note">{note}</div> : null}
        </>
      ) : (
        <div className="what">{event.summary}</div>
      )}
    </div>
  );
}

/**
 * The audit trail. Most events are a sentence; a policy change is a before and
 * after, because that is what someone reading the history needs to see.
 */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return <Empty>No activity yet. Submit a brief to start the loop.</Empty>;
  return (
    <div className="timeline">
      {events.map((event) =>
        event.type === "policy.updated" ? (
          <PolicyChange key={event.id} event={event} />
        ) : (
          <div className="timeline-item" key={event.id}>
            <div className="when">
              {relativeTime(event.createdAt)} · {event.actorType}
            </div>
            <div className="what">{event.summary}</div>
          </div>
        ),
      )}
    </div>
  );
}
