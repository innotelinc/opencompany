"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        revokedSessions?: number;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? `Could not change the password (${response.status}).`);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      const revoked = payload.revokedSessions ?? 0;
      setMessage(
        revoked > 0
          ? `Password changed. ${revoked} other browser${revoked === 1 ? "" : "s"} signed out.`
          : "Password changed.",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
      <div className="grid three" style={{ gap: 10 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="pw-current">Current password</label>
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="pw-new">New password</label>
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="pw-confirm">Repeat new password</label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button className="btn primary small" type="submit" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </button>
        <span className="tiny faint">At least 10 characters. Other browsers are signed out.</span>
      </div>
      {message ? <p className="tiny" style={{ color: "var(--mint)", margin: 0 }}>{message}</p> : null}
      {error ? (
        <p className="tiny" style={{ color: "var(--danger)", margin: 0 }} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
