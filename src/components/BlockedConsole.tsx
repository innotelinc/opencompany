"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface BlockedRow {
  id: string;
  title: string;
  reason: string | null;
  assigneeName: string | null;
  projectName: string | null;
  attempts: number;
  since: string;
}

async function send(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok) return { ok: false as const, error: payload.error ?? `Request failed (${response.status}).` };
  return { ok: true as const };
}

/**
 * Work that has stopped moving. Each row says what stopped it and offers the
 * three things an owner can actually do about it: give it another attempt, hand
 * it to someone else, or stop it. Nothing here widens an employee's authority —
 * it only decides who receives the work and whether it is still wanted.
 */
export default function BlockedPanel({
  tasks,
  employees,
}: {
  tasks: BlockedRow[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);

  async function act(task: BlockedRow, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const result = await send(`/api/tasks/${task.id}`, body);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setReassigning(null);
    router.refresh();
  }

  async function cancel(task: BlockedRow) {
    if (!window.confirm(`Stop "${task.title}"? It will not run again.`)) return;
    await act(task, { action: "cancel", reason: "Stopped by the owner from the blocked list." }, `cancel:${task.id}`);
  }

  if (tasks.length === 0) {
    return <p className="small faint" style={{ margin: 0 }}>Nothing is blocked.</p>;
  }

  return (
    <div className="stack">
      {error ? (
        <p className="tiny" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      {tasks.map((task) => (
        <div key={task.id} className="panel flat stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{task.title}</div>
              <div className="tiny faint">
                {task.assigneeName ?? "no assignee"} · {task.projectName ?? "no project"} ·{" "}
                {task.attempts === 1 ? "1 attempt" : `${task.attempts} attempts`} · blocked {task.since}
              </div>
            </div>
            <span className="badge bad">blocked</span>
          </div>

          <p className="small" style={{ margin: 0 }}>
            <span className="faint">Why: </span>
            {task.reason?.trim() ? task.reason : "nothing recorded — the task cannot say what stopped it"}
          </p>

          <div className="row">
            <button
              className="btn small primary"
              type="button"
              disabled={busy === `retry:${task.id}`}
              onClick={() => act(task, { action: "retry" }, `retry:${task.id}`)}
            >
              {busy === `retry:${task.id}` ? "Retrying…" : "Retry"}
            </button>
            <button
              className="btn small"
              type="button"
              onClick={() => setReassigning(reassigning === task.id ? null : task.id)}
            >
              {reassigning === task.id ? "Cancel" : "Hand to someone else"}
            </button>
            <button className="btn small danger" type="button" disabled={busy === `cancel:${task.id}`} onClick={() => cancel(task)}>
              Stop
            </button>
          </div>

          {reassigning === task.id ? (
            <select
              aria-label={`Reassign ${task.title}`}
              value=""
              disabled={busy === `reassign:${task.id}`}
              onChange={(event) => {
                const employeeId = event.target.value;
                if (!employeeId) return;
                act(task, { action: "reassign", employeeId }, `reassign:${task.id}`);
              }}
            >
              <option value="">Move to…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ))}
    </div>
  );
}
