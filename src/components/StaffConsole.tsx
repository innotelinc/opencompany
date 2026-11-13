"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Mirrors the server's catalogue; kept local so no server module enters the browser bundle. */
export type ComputerAutonomyMode = "guarded" | "yolo" | "host_control";

const COMPUTER_AUTONOMY_COPY: Record<ComputerAutonomyMode, { label: string; hint: string }> = {
  guarded: { label: "Guarded", hint: "Allowlisted commands inside the employee's own workspace." },
  yolo: { label: "YOLO", hint: "Any command, confined to the employee's workspace. Nothing asks first." },
  host_control: { label: "Host control", hint: "Any command from the host root. This employee can change the machine." },
};

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
 * Hire someone new. The form is the same door the roster uses: name, role,
 * reporting line, authority and tools. Nothing here can widen what the server
 * lets the employee do later.
 */
export function HireForm({
  departments,
  employees,
}: {
  departments: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    title: "",
    roleInstructions: "",
    departmentId: departments[0]?.id ?? "",
    managerId: "",
    backend: "deterministic",
    authority: "internal",
    spendLimitCents: 50,
    tools: "files.read, files.write, knowledge.read",
  });

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await post("/api/employees", {
      name: form.name,
      title: form.title,
      roleInstructions: form.roleInstructions,
      departmentId: form.departmentId || null,
      managerId: form.managerId || null,
      backend: form.backend,
      authority: form.authority,
      spendLimitCents: Number(form.spendLimitCents),
      allowedTools: form.tools.split(",").map((tool) => tool.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not hire this employee.");
      return;
    }
    setForm({ ...form, name: "", title: "", roleInstructions: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" type="button" onClick={() => setOpen(true)}>
        Hire employee
      </button>
    );
  }

  return (
    <div className="panel flat sheet">
      <div className="panel-head">
        <h3>Hire an AI employee</h3>
        <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="hire-name">Name</label>
          <input id="hire-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="hire-title">Title</label>
          <input id="hire-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="hire-role">Standing role instructions</label>
        <textarea
          id="hire-role"
          rows={3}
          value={form.roleInstructions}
          onChange={(event) => setForm({ ...form, roleInstructions: event.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="hire-dept">Department</label>
          <select
            id="hire-dept"
            value={form.departmentId}
            onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
          >
            <option value="">—</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hire-manager">Reports to</label>
          <select
            id="hire-manager"
            value={form.managerId}
            onChange={(event) => setForm({ ...form, managerId: event.target.value })}
          >
            <option value="">No manager</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hire-authority">Authority</label>
          <select
            id="hire-authority"
            value={form.authority}
            onChange={(event) => setForm({ ...form, authority: event.target.value })}
          >
            <option value="observe">Observe &amp; propose</option>
            <option value="internal">Internal work</option>
            <option value="limited_external">Delegated spend limits</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="hire-backend">Agent backend</label>
          <select
            id="hire-backend"
            value={form.backend}
            onChange={(event) => setForm({ ...form, backend: event.target.value })}
          >
            <option value="deterministic">deterministic (offline)</option>
            <option value="llm">llm (OpenAI-compatible)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="hire-spend">Per-action spend limit (cents)</label>
          <input
            id="hire-spend"
            type="number"
            min={0}
            value={form.spendLimitCents}
            onChange={(event) => setForm({ ...form, spendLimitCents: Number(event.target.value) })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="hire-tools">Allowed tools (comma separated)</label>
        <input id="hire-tools" value={form.tools} onChange={(event) => setForm({ ...form, tools: event.target.value })} />
      </div>
      <div className="row">
        <button className="btn primary" type="button" onClick={submit} disabled={busy}>
          {busy ? "Hiring…" : "Hire"}
        </button>
        <span className="tiny faint">A computer, a workspace and a durable queue slot are created on first dispatch.</span>
      </div>
      {error ? <p className="tiny" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

/** Fire an employee. Open work is cancelled; the record and its history stay. */
export function FireButton({ employeeId, name, openTasks }: { employeeId: string; name: string; openTasks: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  async function fire() {
    setBusy(true);
    setError(null);
    const result = await post(`/api/employees/${employeeId}`, { action: "fire", reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not remove this employee.");
      return;
    }
    setAsking(false);
    router.refresh();
  }

  if (!asking) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <button className="btn danger small" type="button" onClick={() => setAsking(true)}>
          Fire
        </button>
        {error ? <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span> : null}
      </span>
    );
  }

  return (
    <div className="confirm">
      <p className="tiny" style={{ margin: 0 }}>
        Remove {name}? {openTasks > 0 ? `${openTasks} open task(s) will be cancelled. ` : ""}The record, its tasks and
        its spending history are kept.
      </p>
      <input
        value={reason}
        placeholder="Reason (kept in the audit trail)"
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="row">
        <button className="btn danger small" type="button" onClick={fire} disabled={busy}>
          {busy ? "Removing…" : "Confirm"}
        </button>
        <button className="btn ghost small" type="button" onClick={() => setAsking(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}

/** Assign a task straight to one employee. */
export function TaskForm({
  employees,
  projects = [],
  defaultEmployeeId,
}: {
  employees: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
  defaultEmployeeId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    acceptanceCriteria: "The work is delivered and passes its automated checks.",
    employeeId: defaultEmployeeId ?? employees[0]?.id ?? "",
    projectId: "",
  });

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await post("/api/tasks", {
      title: form.title,
      description: form.description,
      acceptanceCriteria: form.acceptanceCriteria,
      employeeId: form.employeeId,
      projectId: form.projectId || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not assign the task.");
      return;
    }
    setForm({ ...form, title: "", description: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn small" type="button" onClick={() => setOpen(true)}>
        Assign task
      </button>
    );
  }

  return (
    <div className="panel flat sheet">
      <div className="panel-head">
        <h3>Assign a task</h3>
        <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="field">
        <label htmlFor="task-title">Task</label>
        <input
          id="task-title"
          value={form.title}
          placeholder="e.g. Rewrite the pricing page for the new plan names"
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="task-desc">Instructions</label>
        <textarea
          id="task-desc"
          rows={4}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="task-criteria">Acceptance criteria (one per line)</label>
        <textarea
          id="task-criteria"
          rows={3}
          value={form.acceptanceCriteria}
          onChange={(event) => setForm({ ...form, acceptanceCriteria: event.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="task-owner">Owner</label>
          <select
            id="task-owner"
            value={form.employeeId}
            onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-project">Project</label>
          <select
            id="task-project"
            value={form.projectId}
            onChange={(event) => setForm({ ...form, projectId: event.target.value })}
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn primary" type="button" onClick={submit} disabled={busy || !form.title.trim()}>
        {busy ? "Assigning…" : "Assign to employee"}
      </button>
      {error ? <p className="tiny" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

const MODES: ComputerAutonomyMode[] = ["guarded", "yolo", "host_control"];

/**
 * The owner's switch over one employee's computer. Host control is the one that
 * can change the machine, so it asks for a written reason and a confirmation.
 */
export function AutonomyControl({
  employeeId,
  employeeName,
  mode,
  compact = false,
}: {
  employeeId: string;
  employeeName: string;
  mode: ComputerAutonomyMode;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  async function choose(next: ComputerAutonomyMode) {
    if (next === "host_control" && !window.confirm(`Give ${employeeName} complete host system control? Its commands will run from the host root and can change this machine.`)) {
      return;
    }
    if (next === "yolo" && !window.confirm(`Turn on YOLO for ${employeeName}? Any command will run without the allowlist, inside its workspace.`)) {
      return;
    }
    setBusy(next);
    setError(null);
    const result = await post(`/api/computers/${employeeId}`, { action: "autonomy", mode: next, reason });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "Could not change autonomy.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="autonomy">
      <div className="row" style={{ gap: 6 }}>
        {!compact ? <span className="tiny faint">Computer</span> : null}
        {MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${mode === option ? " on" : ""}${option === "host_control" ? " danger" : ""}`}
            disabled={busy !== null || pending}
            onClick={() => choose(option)}
            title={COMPUTER_AUTONOMY_COPY[option].hint}
          >
            {busy === option ? "…" : COMPUTER_AUTONOMY_COPY[option].label}
          </button>
        ))}
        <button type="button" className="btn ghost small" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Hide" : "Why"}
        </button>
      </div>
      {expanded ? (
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          <p className="tiny faint" style={{ margin: 0 }}>
            {COMPUTER_AUTONOMY_COPY[mode].hint}
          </p>
          <input
            value={reason}
            placeholder="Why (kept in the audit trail)"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      ) : null}
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: "6px 0 0" }}>{error}</p> : null}
    </div>
  );
}
