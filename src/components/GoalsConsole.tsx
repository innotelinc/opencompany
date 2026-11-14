"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface GoalRow {
  id: string;
  title: string;
  description: string;
  status: string;
  budgetCents: number;
}

const STATUSES = ["active", "paused", "completed", "cancelled"] as const;

async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok) return { ok: false as const, error: payload.error ?? `Request failed (${response.status}).` };
  return { ok: true as const };
}

function tone(status: string) {
  if (status === "completed") return "ok";
  if (status === "cancelled" || status === "paused") return "warn";
  return "info";
}

/**
 * The owner's own goals, editable in place. A goal is what the CEO plans
 * against, so this is a statement of intent rather than permission: editing one
 * never widens what an employee may do.
 */
export default function GoalsPanel({ goals }: { goals: GoalRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", description: "", budgetCents: 0 });

  async function create() {
    setBusy("new");
    setError(null);
    const result = await send("/api/goals", "POST", draft);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setDraft({ title: "", description: "", budgetCents: 0 });
    setAdding(false);
    router.refresh();
  }

  async function save(goal: GoalRow, next: { title: string; description: string; budgetCents: number }) {
    setBusy(goal.id);
    setError(null);
    const result = await send(`/api/goals/${goal.id}`, "PATCH", next);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setEditing(null);
    router.refresh();
  }

  async function setStatus(goal: GoalRow, status: string) {
    setBusy(goal.id);
    setError(null);
    const result = await send(`/api/goals/${goal.id}`, "PATCH", { status });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function remove(goal: GoalRow) {
    if (!window.confirm(`Remove the goal "${goal.title}"? Projects and reports it produced are kept.`)) return;
    setBusy(goal.id);
    setError(null);
    const result = await send(`/api/goals/${goal.id}`, "DELETE");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="tiny faint">
          {goals.length === 0 ? "No goals yet." : `${goals.length} goal${goals.length === 1 ? "" : "s"}`}
        </span>
        <button className="btn small" type="button" onClick={() => setAdding((open) => !open)}>
          {adding ? "Cancel" : "New goal"}
        </button>
      </div>

      {error ? (
        <p className="tiny" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      {adding ? (
        <div className="panel flat sheet stack">
          <div className="field">
            <label htmlFor="goal-title">Goal</label>
            <input
              id="goal-title"
              value={draft.title}
              placeholder="e.g. Launch the pricing page refresh"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="goal-description">What done looks like</label>
            <textarea
              id="goal-description"
              rows={3}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="goal-budget">Budget in cents</label>
            <input
              id="goal-budget"
              type="number"
              min={0}
              value={draft.budgetCents}
              onChange={(event) => setDraft({ ...draft, budgetCents: Number(event.target.value) || 0 })}
            />
          </div>
          <div className="row">
            <button className="btn small primary" type="button" disabled={busy === "new"} onClick={create}>
              {busy === "new" ? "Saving…" : "Add goal"}
            </button>
          </div>
        </div>
      ) : null}

      {goals.map((goal) =>
        editing === goal.id ? (
          <GoalEditor
            key={goal.id}
            goal={goal}
            busy={busy === goal.id}
            onCancel={() => setEditing(null)}
            onSave={(next) => save(goal, next)}
          />
        ) : (
          <div key={goal.id} className="panel flat stack" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16 }}>{goal.title}</div>
                {goal.description ? <div className="tiny faint">{goal.description}</div> : null}
                <div className="tiny faint">{goal.budgetCents}¢ budget</div>
              </div>
              <span className={`badge ${tone(goal.status)}`}>{goal.status}</span>
            </div>
            <div className="row">
              <button className="btn small" type="button" disabled={busy === goal.id} onClick={() => setEditing(goal.id)}>
                Edit
              </button>
              <select
                aria-label={`Status for ${goal.title}`}
                value={goal.status}
                disabled={busy === goal.id}
                onChange={(event) => setStatus(goal, event.target.value)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                className="btn small danger"
                type="button"
                disabled={busy === goal.id}
                onClick={() => remove(goal)}
              >
                Remove
              </button>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function GoalEditor({
  goal,
  busy,
  onSave,
  onCancel,
}: {
  goal: GoalRow;
  busy: boolean;
  onSave: (next: { title: string; description: string; budgetCents: number }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    title: goal.title,
    description: goal.description,
    budgetCents: goal.budgetCents,
  });

  return (
    <div className="panel flat sheet stack">
      <div className="field">
        <label htmlFor={`goal-title-${goal.id}`}>Goal</label>
        <input
          id={`goal-title-${goal.id}`}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`goal-description-${goal.id}`}>What done looks like</label>
        <textarea
          id={`goal-description-${goal.id}`}
          rows={3}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`goal-budget-${goal.id}`}>Budget in cents</label>
        <input
          id={`goal-budget-${goal.id}`}
          type="number"
          min={0}
          value={draft.budgetCents}
          onChange={(event) => setDraft({ ...draft, budgetCents: Number(event.target.value) || 0 })}
        />
      </div>
      <div className="row">
        <button className="btn small primary" type="button" disabled={busy} onClick={() => onSave(draft)}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn small ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
