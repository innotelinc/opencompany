"use client";

import { useEffect, useRef, useState } from "react";

interface LiveSnapshot {
  at: string;
  halted: boolean;
  worker: { alive: boolean };
  counts: {
    employees: number;
    working: number;
    open: number;
    running: number;
    completed: number;
    blocked: number;
  };
  activity: { id: string; type: string; summary: string; at: string }[];
}

/** Stable clock: the strip must not redraw just to age a timestamp. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Live state that is always on screen, on every page.
 *
 * Polling is only how it learns that something happened. The strip compares what
 * it received with what it already shows and commits new state only when the
 * facts differ — a task starting, a run finishing, the worker dropping out — so
 * a quiet company leaves the bar completely still. `at` and the worker's
 * heartbeat age are deliberately not part of that comparison: they change on
 * every request and would defeat the point.
 */
export default function LiveStrip() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const shown = useRef<string>("");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { ok?: boolean; error?: string } & LiveSnapshot;
        if (payload.ok === false) throw new Error(payload.error ?? "The live feed refused this request.");
        if (!alive) return;

        const latestId = payload.activity?.[0]?.id ?? "";
        const signature = JSON.stringify([
          payload.halted,
          payload.worker.alive,
          payload.counts,
          latestId,
        ]);
        if (signature !== shown.current) {
          shown.current = signature;
          setSnapshot(payload);
          setFailure(null);
        }
      } catch (error) {
        if (alive) setFailure(error instanceof Error ? error.message : String(error));
      } finally {
        if (alive) timer = setTimeout(load, 2500);
      }
    };

    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const counts = snapshot?.counts;
  const latest = snapshot?.activity?.[0];
  const workerAlive = snapshot?.worker.alive ?? false;

  return (
    <div className={`live-strip${snapshot?.halted ? " halted" : ""}`} role="status" aria-live="polite">
      <span className={`live-dot${workerAlive ? " on" : " off"}`} aria-hidden />
      <span className="live-label">Live</span>

      {counts ? (
        <span className="live-metrics">
          <span>
            <strong>{counts.working}</strong> working
          </span>
          <span>
            <strong>{counts.running}</strong> running
          </span>
          <span>
            <strong>{counts.open}</strong> open
          </span>
          <span>
            <strong>{counts.completed}</strong> done
          </span>
          {counts.blocked > 0 ? (
            <span className="live-warn">
              <strong>{counts.blocked}</strong> blocked
            </span>
          ) : null}
        </span>
      ) : (
        <span className="live-metrics faint">connecting…</span>
      )}

      <span className="live-event">
        {failure ? (
          <span className="live-warn">live feed unavailable — {failure}</span>
        ) : latest ? (
          <>
            <span className="live-event-text" key={latest.id}>
              {latest.summary}
            </span>
            <span className="faint"> · {clock(latest.at)}</span>
          </>
        ) : (
          <span className="faint">no activity yet</span>
        )}
      </span>

      <span className="live-state">
        {snapshot?.halted ? (
          <span className="badge bad">stopped</span>
        ) : workerAlive ? (
          <span className="badge ok">worker live</span>
        ) : (
          <span className="badge warn">worker offline</span>
        )}
      </span>
    </div>
  );
}
