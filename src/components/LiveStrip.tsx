"use client";

import { useEffect, useRef, useState } from "react";

interface LiveSnapshot {
  at: string;
  halted: boolean;
  worker: { alive: boolean; ageSeconds: number };
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

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

/**
 * Live state that is always on screen, on every page.
 *
 * It polls a small endpoint instead of streaming, so it keeps working behind the
 * proxies and reloads this app has to survive: if a request fails the strip says
 * so rather than freezing on stale numbers.
 */
export default function LiveStrip() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { ok?: boolean; error?: string } & LiveSnapshot;
        if (!mounted.current) return;
        if (payload.ok === false) throw new Error(payload.error ?? "The live feed refused this request.");
        setSnapshot(payload);
        setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted.current) {
          setTick((value) => value + 1);
          timer = setTimeout(load, 2500);
        }
      }
    };

    void load();
    return () => {
      mounted.current = false;
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
            <span className="faint"> · {ago(latest.at)}</span>
          </>
        ) : (
          <span className="faint">no activity yet</span>
        )}
      </span>

      <span className="live-state" title={`snapshot ${tick}`}>
        {snapshot?.halted ? (
          <span className="badge bad">stopped</span>
        ) : workerAlive ? (
          <span className="badge ok">worker {snapshot?.worker.ageSeconds ?? 0}s</span>
        ) : (
          <span className="badge warn">worker offline</span>
        )}
      </span>
    </div>
  );
}
