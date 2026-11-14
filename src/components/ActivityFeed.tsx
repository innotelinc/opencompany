import type { ActivityView } from "@/lib/domain/activity-view";
import { activityViews } from "@/lib/domain/activity-view";
import type { ActivityEvent } from "@/lib/domain/types";
import { Badge, Empty } from "@/components/ui";

function PolicyChange({ event }: { event: ActivityView }) {
  const policy = event.policy!;
  return (
    <div className="timeline-item policy">
      <div className="when">
        {event.byline} <Badge tone="warn">policy</Badge>
      </div>
      <div className="what mono">{policy.key}</div>
      <div className="policy-change">
        <span className="was">{policy.from}</span>
        <span className="arrow">→</span>
        <span className="now">{policy.to}</span>
      </div>
      {policy.note ? <div className="policy-note">{policy.note}</div> : null}
    </div>
  );
}

/**
 * The audit trail. Most events are a sentence; a policy change is a before and
 * after, because that is what someone reading the history needs to see.
 */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const views = activityViews(events);
  if (views.length === 0) return <Empty>No activity yet. Submit a brief to start the loop.</Empty>;
  return (
    <div className="timeline">
      {views.map((event) =>
        event.policy ? (
          <PolicyChange key={event.id} event={event} />
        ) : (
          <div className="timeline-item" key={event.id}>
            <div className="when">{event.byline}</div>
            <div className="what">{event.text}</div>
          </div>
        ),
      )}
    </div>
  );
}
