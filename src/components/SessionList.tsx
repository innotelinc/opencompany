"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { relativeTime } from "@/lib/time";

export interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
}

/** A user agent is long and mostly noise; the first clause names the browser. */
function describe(userAgent: string | null): string {
  if (!userAgent) return "unknown browser";
  const cleaned = userAgent.replace(/^Mozilla\/[\d.]+\s*/, "").replace(/\(([^)]*)\)/g, "");
  const first = cleaned.split(";")[0].split(")")[0].trim();
  return (first || userAgent).slice(0, 80);
}

export function SessionList({ sessions, currentSessionId }: { sessions: SessionRow[]; currentSessionId: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/auth/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; revokedCurrent?: boolean };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? `Could not revoke that session (${response.status}).`);
        return;
      }
      if (payload.revokedCurrent) {
        window.location.assign("/signin");
        return;
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (sessions.length === 0) {
    return <p className="small muted">No browser is signed in.</p>;
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <table>
        <thead>
          <tr>
            <th>Browser</th>
            <th>Started</th>
            <th>Last seen</th>
            <th>Expires</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const current = session.id === currentSessionId;
            return (
              <tr key={session.id}>
                <td className="small">
                  {describe(session.userAgent)}{" "}
                  {current ? <span className="badge ok">this browser</span> : null}
                </td>
                <td className="tiny faint">{relativeTime(session.createdAt)}</td>
                <td className="tiny faint">{relativeTime(session.lastSeenAt)}</td>
                <td className="tiny faint">{relativeTime(session.expiresAt).replace(" ago", "")}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn danger small"
                    type="button"
                    disabled={busyId === session.id}
                    onClick={() => revoke(session.id)}
                  >
                    {busyId === session.id ? "Revoking…" : current ? "Sign out" : "Revoke"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? (
        <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <p className="tiny faint" style={{ margin: 0 }}>
        Revoking ends that browser on its next request. Signing out the current one returns you to the sign-in page.
      </p>
    </div>
  );
}
