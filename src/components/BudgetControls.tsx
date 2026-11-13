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
 * The owner sets a planning figure, or removes it entirely.
 *
 * It is not a ceiling: no task is stopped, throttled or warned about by this
 * number. Spending is recorded as it happens and reported as history next to
 * this form. What the figure is good for is the comparison: how the month is
 * tracking against the number the owner had in mind.
 */
export function BudgetSettings({
  limitCents,
  autoApproveCents,
}: {
  limitCents: number;
  autoApproveCents: number;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(limitCents));
  const [autoApprove, setAutoApprove] = useState(String(autoApproveCents));
  const [removed, setRemoved] = useState(limitCents <= 0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function save(nextLimit: number) {
    setBusy(true);
    setMessage(null);
    if (!Number.isFinite(nextLimit) || nextLimit < 0) {
      setBusy(false);
      setMessage("Enter a whole number of dollars.");
      return;
    }
    const result = await post("/api/budget", {
      monthlyLimitCents: nextLimit,
      autoApproveCents: Math.max(0, Math.round(Number(autoApprove))),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error ?? "Could not save the figure.");
      return;
    }
    setRemoved(nextLimit <= 0);
    setMessage(nextLimit <= 0 ? "Figure removed. History keeps recording." : "Saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="budget-plan">Planning figure (USD / month)</label>
          <input
            id="budget-plan"
            type="number"
            min={0}
            step="0.01"
            value={removed ? "" : (Number(limit) / 100).toString()}
            placeholder={removed ? "none" : undefined}
            disabled={removed}
            onChange={(event) => setLimit(String(Math.round(Number(event.target.value) * 100)))}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="budget-auto">Auto-approve spend up to (USD)</label>
          <input
            id="budget-auto"
            type="number"
            min={0}
            step="0.01"
            value={(Number(autoApprove) / 100).toString()}
            onChange={(event) => setAutoApprove(String(Math.round(Number(event.target.value) * 100)))}
          />
        </div>
        <button
          className="btn primary small"
          type="button"
          disabled={busy || pending || removed}
          onClick={() => save(Math.round(Number(limit)))}
        >
          {busy ? "Saving…" : "Save figure"}
        </button>
        <button
          className="btn small"
          type="button"
          disabled={busy || pending || removed}
          onClick={() => save(0)}
        >
          Remove figure
        </button>
        {removed ? <span className="tiny faint">No figure set — spend is still recorded.</span> : null}
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>
        This number never stops work. Paying an external party is still your approval, at any amount.
      </p>
      {message ? <span className="tiny faint">{message}</span> : null}
    </div>
  );
}

/** Read-only spend history: daily bars, categories, and what dominated. */
export function SpendHistory({
  days,
  byCategory,
  totalCents,
  entries,
  peakDay,
}: {
  days: { date: string; label: string; cents: number; entries: number }[];
  byCategory: { key: string; cents: number; entries: number; share: number }[];
  totalCents: number;
  entries: number;
  peakDay: { label: string; cents: number } | null;
}) {
  const max = Math.max(1, ...days.map((day) => day.cents));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid three">
        <div className="metric">
          <span className="label">Recorded</span>
          <span className="value">${(totalCents / 100).toFixed(2)}</span>
          <span className="hint">{entries} ledger entries</span>
        </div>
        <div className="metric">
          <span className="label">Per day</span>
          <span className="value">${(totalCents / 100 / Math.max(1, days.length)).toFixed(2)}</span>
          <span className="hint">average over {days.length} days</span>
        </div>
        <div className="metric">
          <span className="label">Busiest day</span>
          <span className="value">{peakDay ? `$${(peakDay.cents / 100).toFixed(2)}` : "—"}</span>
          <span className="hint">{peakDay?.label ?? "no spend recorded"}</span>
        </div>
      </div>

      <div className="bars" role="img" aria-label="Daily spend">
        {days.map((day) => (
          <div className="bar-col" key={day.date} title={`${day.label}: $${(day.cents / 100).toFixed(2)}`}>
            <span className="bar" style={{ height: `${Math.max(2, Math.round((day.cents / max) * 100))}%` }} />
            <span className="bar-label">{day.label.split(" ")[1]}</span>
          </div>
        ))}
      </div>

      {byCategory.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Nothing recorded in this window yet.
        </p>
      ) : (
        <ul className="list">
          {byCategory.map((slice) => (
            <li key={slice.key}>
              <span className="small">{slice.key}</span>
              <span className="tiny faint">
                ${(slice.cents / 100).toFixed(2)} · {Math.round(slice.share * 100)}% · {slice.entries} entries
              </span>
            </li>
          ))}
        </ul>
      )}
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
