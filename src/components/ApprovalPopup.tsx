"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Pending {
  id: string;
  title: string;
  kind: string;
  risk: string;
  businessReason: string;
  createdAt: string;
  action: Record<string, unknown>;
}

const POLL_MS = 3000;

/**
 * The decision that arrives while the owner is at the desk.
 *
 * Two jobs in one poll: read what is waiting and say "I am here", which is what
 * stops the worker from emailing. The popup only ever acts on a decision that is
 * still pending, and it sends the action it displayed, so the server's hash check
 * still applies to a click made from here.
 */
export default function ApprovalPopup() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeat = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/approvals", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { ok?: boolean; pending?: Pending[] };
      if (payload.ok === false || !payload.pending) return;
      setPending(payload.pending);
      setDismissed((current) => current.filter((id) => payload.pending!.some((item) => item.id === id)));
    } catch {
      // A closed tab or a restarting server is not an error worth showing.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await load();
      if (!alive) return;
      // Presence is a separate call so a failed read never stops the heartbeat.
      if (Date.now() - heartbeat.current > POLL_MS * 2) {
        heartbeat.current = Date.now();
        void fetch("/api/presence", { method: "POST" }).catch(() => undefined);
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);

  const current = pending.find((item) => !dismissed.includes(item.id)) ?? null;

  async function decide(action: "approve" | "reject") {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/decisions/${current.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: action === "approve" ? "Approved from the live approval panel." : "Rejected from the live approval panel.",
          actionDetails: action === "approve" ? current.action : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        setError(payload.error ?? `Request failed (${response.status}).`);
        return;
      }
      setDismissed((list) => [...list, current.id]);
      router.refresh();
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <div className="approval-scrim" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <div className="approval-card">
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <span className={`badge ${current.risk === "high" ? "bad" : "warn"}`}>{current.risk} risk</span>
          <span className="badge">{current.kind.replace(/_/g, " ")}</span>
          <span className="tiny faint">just now</span>
        </div>
        <h2 id="approval-title" style={{ margin: "4px 0 6px", fontSize: 19 }}>
          {current.title}
        </h2>
        <p className="small muted" style={{ marginTop: 0 }}>{current.businessReason}</p>
        <pre className="mono pre tiny" style={{ background: "#11140f", padding: 12, borderRadius: 8, maxHeight: 240, overflow: "auto" }}>
          {JSON.stringify(current.action, null, 2)}
        </pre>
        <p className="tiny faint">
          This popup is the live channel. If you close the tab, the same decision is emailed to you with a link that works once.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button type="button" className="btn primary" disabled={busy} onClick={() => decide("approve")}>
            {busy ? "Working…" : "Approve exact action"}
          </button>
          <button type="button" className="btn danger" disabled={busy} onClick={() => decide("reject")}>
            Reject
          </button>
          <a className="btn ghost" href="/decisions" onClick={() => setDismissed((list) => [...list, current.id])}>
            Open decisions
          </a>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDismissed((list) => [...list, current.id])}
            style={{ marginLeft: "auto" }}
          >
            Later
          </button>
        </div>
        {error ? <p className="tiny" style={{ color: "var(--danger)", marginBottom: 0 }}>{error}</p> : null}
      </div>
    </div>
  );
}
