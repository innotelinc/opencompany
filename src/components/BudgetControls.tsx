"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok) return { ok: false, error: payload.error ?? `Request failed (${response.status}).` };
  return { ok: true };
}

/**
 * The owner sets the budget figures. A limit of zero means "no ceiling": usage is
 * still recorded and shown, it just never reports an overrun.
 */
export function BudgetForm({
  limitCents,
  autoApproveCents,
}: {
  limitCents: number;
  autoApproveCents: number;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(limitCents));
  const [autoApprove, setAutoApprove] = useState(String(autoApproveCents));
  const [unlimited, setUnlimited] = useState(limitCents <= 0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function save() {
    setBusy(true);
    setMessage(null);
    const limitValue = unlimited ? 0 : Math.round(Number(limit));
    if (!Number.isFinite(limitValue) || limitValue < 0) {
      setBusy(false);
      setMessage("Enter a whole number of cents, or choose no ceiling.");
      return;
    }
    const result = await post("/api/budget", {
      monthlyLimitCents: limitValue,
      autoApproveCents: Math.max(0, Math.round(Number(autoApprove))),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error ?? "Could not save the budget.");
      return;
    }
    setMessage(unlimited ? "Saved: no monthly ceiling." : "Saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="budget-limit">Monthly ceiling (cents)</label>
          <input
            id="budget-limit"
            type="number"
            min={0}
            step={1}
            value={unlimited ? 0 : limit}
            disabled={unlimited}
            onChange={(event) => setLimit(event.target.value)}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="budget-auto">Auto-approve at or below (cents)</label>
          <input
            id="budget-auto"
            type="number"
            min={0}
            step={1}
            value={autoApprove}
            onChange={(event) => setAutoApprove(event.target.value)}
          />
        </div>
        <label htmlFor="budget-unlimited" className="row small" style={{ gap: 6 }}>
          <input
            id="budget-unlimited"
            type="checkbox"
            checked={unlimited}
            style={{ width: "auto" }}
            onChange={(event) => setUnlimited(event.target.checked)}
          />
          No ceiling
        </label>
        <button type="button" className="btn primary small" disabled={busy || pending} onClick={save}>
          {busy ? "Saving…" : "Save budget"}
        </button>
      </div>
      {message ? <span className="tiny faint">{message}</span> : null}
    </div>
  );
}

/** Ask the running app whether the public site answers, right now. */
export function SiteProbeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="row" style={{ gap: 8 }}>
      <button
        type="button"
        className="btn small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            const response = await fetch("/api/public-site/health", { cache: "no-store" });
            const payload = (await response.json().catch(() => ({}))) as {
              ok?: boolean;
              site?: { detail?: string };
            };
            setMessage(payload.site?.detail ?? (payload.ok ? "Reachable." : "Not reachable."));
            router.refresh();
          } catch (error) {
            setMessage(String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Check now"}
      </button>
      {message ? <span className="tiny faint">{message}</span> : null}
    </span>
  );
}
