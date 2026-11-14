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
 * The owner sets the budget, or removes it entirely.
 *
 * The budget is yearly. It is measured monthly and adjusted quarterly on
 * performance, and it is a recording of what was spent — never a ceiling. No
 * task, goal or plan is stopped by it, and there is no per-call budget.
 */
export function BudgetSettings({
  annualLimitCents,
  monthSpentCents,
  quarterSpentCents,
}: {
  annualLimitCents: number;
  monthSpentCents: number;
  quarterSpentCents: number;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(annualLimitCents));
  const [removed, setRemoved] = useState(annualLimitCents <= 0);
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
    const result = await post("/api/budget", { annualBudgetCents: nextLimit });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error ?? "Could not save the figure.");
      return;
    }
    setRemoved(nextLimit <= 0);
    setMessage(nextLimit <= 0 ? "Budget removed. Spend keeps being recorded." : "Saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="budget-plan">Budget (USD / year)</label>
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
        <button
          className="btn primary small"
          type="button"
          disabled={busy || pending || removed}
          onClick={() => save(Math.round(Number(limit)))}
        >
          {busy ? "Saving…" : "Save budget"}
        </button>
        <button
          className="btn small"
          type="button"
          disabled={busy || pending || removed}
          onClick={() => save(0)}
        >
          Remove budget
        </button>
        {removed ? <span className="tiny faint">No budget set — spend is still recorded.</span> : null}
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>
        Yearly budget, measured monthly and adjusted quarterly on performance. It never stops work and there is no
        per-call budget: any task or goal that is set gets completed. Paying an external party is still your approval.
      </p>
      {removed ? null : (
        <p className="tiny faint" style={{ margin: 0 }}>
          This month ${(monthSpentCents / 100).toFixed(2)} recorded of ${
            (annualLimitCents / 1200).toFixed(2)
          } on pace · this quarter ${(quarterSpentCents / 100).toFixed(2)} recorded of ${
            (annualLimitCents / 400).toFixed(2)
          } on pace.
        </p>
      )}
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
