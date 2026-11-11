"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StandingApproval } from "@/lib/domain/autonomy";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok) return { ok: false, error: payload.error ?? `Request failed (${response.status}).` };
  return { ok: true, error: payload.error };
}

export function ActionButton({
  endpoint,
  body,
  label,
  tone = "btn",
  confirmText,
  small,
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  tone?: "btn" | "btn primary" | "btn danger" | "btn ghost" | "btn small" | "btn primary small" | "btn danger small";
  confirmText?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 6 }}>
      <button
        type="button"
        className={tone}
        disabled={busy}
        style={small ? { padding: "4px 9px", fontSize: 11.5 } : undefined}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setError(null);
          const result = await post(endpoint, body);
          setBusy(false);
          if (!result.ok) setError(result.error ?? "Failed");
          router.refresh();
        }}
      >
        {busy ? "Working…" : label}
      </button>
      {error ? <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span> : null}
    </span>
  );
}

export function BriefForm({ defaultBudget = 500 }: { defaultBudget?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Prepare a small website for a new client");
  const [brief, setBrief] = useState(
    "Prepare a small website for this customer using the attached requirements. Keep it to three pages, run the checks, and bring me the deployment decision before anything is published.",
  );
  const [requirements, setRequirements] = useState(
    [
      "Customer: New client",
      "Industry: independent bookkeeping studio",
      "Sections: Home, About, Services, Contact",
      "Tone: calm, precise, human",
      "Contact email: hello@example.test",
      "Primary color: #1f3d34",
      "Accent color: #d8a24a",
      "Notes: Small business owners who want clear numbers and no surprises.",
      "Constraints: static files only; no analytics, trackers or external assets; the contact form must not claim a backend.",
    ].join("\n"),
  );
  const [budget, setBudget] = useState(defaultBudget);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit() {
    setBusy(true);
    setMessage(null);
    const result = await post("/api/brief", { title, brief, requirements, budgetCents: budget });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error ?? "Could not submit the brief.");
      return;
    }
    setMessage("Brief saved. The CEO is planning; the plan will appear in Decisions for your approval.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted" style={{ margin: 0 }}>
          Give the company a goal. Requirements are saved as company knowledge before any work starts.
        </p>
        <button type="button" className="btn small" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide" : "New brief"}
        </button>
      </div>
      {open ? (
        <div>
          <div className="field">
            <label htmlFor="brief-title">Goal title</label>
            <input id="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="brief-instruction">Instruction to the company</label>
            <textarea id="brief-instruction" rows={3} value={brief} onChange={(event) => setBrief(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="brief-requirements">Customer requirements (saved as knowledge)</label>
            <textarea
              id="brief-requirements"
              rows={9}
              className="mono"
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="brief-budget">Goal budget (cents)</label>
            <input
              id="brief-budget"
              type="number"
              min={0}
              max={100000}
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
            />
          </div>
          <button type="button" className="btn primary" onClick={submit} disabled={busy || pending}>
            {busy ? "Saving…" : "Send to the CEO"}
          </button>
          {message ? <p className="small" style={{ marginTop: 10 }}>{message}</p> : null}
          <p className="tiny faint" style={{ marginTop: 10 }}>
            The customer, domain and email here are fictional. Demo mode performs real file work and real checks with
            no model calls and no external contact.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DecisionActions({
  decisionId,
  actionJson,
}: {
  decisionId: string;
  actionJson: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(action: "approve" | "reject" | "revise") {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { action, note };
    if (action === "approve") {
      try {
        // Bind the approval to exactly what the owner is looking at.
        body.actionDetails = JSON.parse(actionJson);
      } catch {
        body.actionDetails = undefined;
      }
    }
    const result = await post(`/api/decisions/${decisionId}`, body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Decision failed.");
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <button className="btn primary" type="button" disabled={busy} onClick={() => send("approve")}>
          Approve exact action
        </button>
        <button className="btn danger" type="button" disabled={busy} onClick={() => send("reject")}>
          Reject
        </button>
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor={`note-${decisionId}`}>Note (required to request a revision)</label>
          <input
            id={`note-${decisionId}`}
            value={note}
            placeholder="What should change?"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => send("revise")}>
          Request revision
        </button>
      </div>
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}

const STANDING_KIND_LABELS: { value: string; label: string; hint: string }[] = [
  { value: "plan", label: "Plans and budgets", hint: "Release CEO plans without a manual approval, at any budget." },
  { value: "spend", label: "Spending", hint: "Approve purchases of any size without waiting for the desk." },
  { value: "external_communication", label: "External messages", hint: "Send prepared messages to prepared recipients." },
  { value: "public_deploy", label: "Public deployment", hint: "Publish a reviewed artifact. Hard to recall once it starts." },
];

/**
 * The owner grants a bounded, revocable standing approval once and the company
 * keeps applying it. It is stored as company policy, so it survives restarts
 * and is visible in Administration next to every other limit.
 */
export function StandingApprovalForm({ approval }: { approval: StandingApproval }) {
  const router = useRouter();
  const [kinds, setKinds] = useState<string[]>(approval.kinds);
  const [note, setNote] = useState(approval.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(value: string) {
    setKinds((current) =>
      current.includes(value) ? current.filter((kind) => kind !== value) : [...current, value],
    );
  }

  async function send(action: "grant" | "revoke") {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await post("/api/autonomy", { action, kinds, note });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the standing approval.");
      return;
    }
    setMessage(
      action === "grant"
        ? "Standing approval remembered. Matching decisions are approved automatically from now on."
        : "Standing approval revoked. Every decision waits for you again.",
    );
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className={`badge ${approval.granted ? "ok" : "warn"}`}>
          {approval.granted ? "standing approval active" : "waiting for you"}
        </span>
        {approval.granted ? (
          <span className="tiny faint">
            granted by the owner {approval.grantedAt ? new Date(approval.grantedAt).toLocaleString() : "earlier"} · no
            ceiling{approval.note ? ` · “${approval.note}”` : ""}
          </span>
        ) : (
          <span className="tiny faint">Nothing is approved automatically until you grant it here.</span>
        )}
      </div>

      <div className="grid" style={{ gap: 6 }}>
        {STANDING_KIND_LABELS.map((option) => (
          <label
            key={option.value}
            htmlFor={`standing-${option.value}`}
            className="row"
            style={{ gap: 8, alignItems: "flex-start", textTransform: "none", letterSpacing: 0, margin: 0 }}
          >
            <input
              id={`standing-${option.value}`}
              type="checkbox"
              checked={kinds.includes(option.value)}
              onChange={() => toggle(option.value)}
              style={{ width: 15, height: 15, marginTop: 3, accentColor: "var(--brass)" }}
            />
            <span>
              <span style={{ color: "var(--ink)", fontSize: 12.5 }}>{option.label}</span>
              <br />
              <span className="tiny faint">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="field-row">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="standing-note">Why (kept in the audit trail)</label>
          <input
            id="standing-note"
            value={note}
            placeholder="e.g. ship routine site updates without me"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <div className="row">
        <button className="btn primary" type="button" disabled={busy} onClick={() => send("grant")}>
          {busy ? "Saving…" : approval.granted ? "Update standing approval" : "Grant standing approval"}
        </button>
        {approval.granted ? (
          <button className="btn danger" type="button" disabled={busy} onClick={() => send("revoke")}>
            Revoke
          </button>
        ) : null}
      </div>

      <p className="tiny faint" style={{ margin: 0 }}>
        The grant is unlimited inside the kinds you tick — every amount, every risk. Credential use and data export still
        come to you, and the emergency stop overrides everything.
      </p>
      {message ? <p className="small" style={{ margin: 0 }}>{message}</p> : null}
      {error ? <p className="tiny" style={{ margin: 0, color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

export function EmployeeForm({
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
      setError(result.error ?? "Could not create the employee.");
      return;
    }
    setForm({ ...form, name: "", title: "", roleInstructions: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn small" type="button" onClick={() => setOpen(true)}>
        Add employee
      </button>
    );
  }

  return (
    <div className="panel flat">
      <div className="panel-head">
        <h3>New AI employee</h3>
        <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="emp-name">Name</label>
          <input id="emp-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="emp-title">Title</label>
          <input id="emp-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="emp-role">Standing role instructions</label>
        <textarea
          id="emp-role"
          rows={3}
          value={form.roleInstructions}
          onChange={(event) => setForm({ ...form, roleInstructions: event.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="emp-dept">Department</label>
          <select id="emp-dept" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
            <option value="">—</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="emp-manager">Reports to</label>
          <select id="emp-manager" value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })}>
            <option value="">No manager</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="emp-authority">Authority</label>
          <select id="emp-authority" value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value })}>
            <option value="observe">Observe &amp; propose</option>
            <option value="internal">Internal work</option>
            <option value="limited_external">Delegated spend limits</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="emp-backend">Agent backend</label>
          <select id="emp-backend" value={form.backend} onChange={(event) => setForm({ ...form, backend: event.target.value })}>
            <option value="deterministic">deterministic (simulated, offline)</option>
            <option value="llm">llm (OpenAI-compatible)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="emp-spend">Per-action spend limit (cents)</label>
          <input
            id="emp-spend"
            type="number"
            min={0}
            value={form.spendLimitCents}
            onChange={(event) => setForm({ ...form, spendLimitCents: Number(event.target.value) })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="emp-tools">Allowed tools (comma separated)</label>
        <input id="emp-tools" value={form.tools} onChange={(event) => setForm({ ...form, tools: event.target.value })} />
      </div>
      <button className="btn primary" type="button" onClick={submit} disabled={busy}>
        {busy ? "Creating…" : "Create employee"}
      </button>
      {error ? <p className="tiny" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

export function KnowledgeForm({ employees }: { employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
    accessScope: "company",
    employeeId: "",
  });

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await post("/api/knowledge", {
      action: "create",
      title: form.title,
      body: form.body,
      accessScope: form.accessScope,
      ownerEmployeeId: form.accessScope === "private" ? form.employeeId || null : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the document.");
      return;
    }
    setForm({ ...form, title: "", body: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn small" type="button" onClick={() => setOpen(true)}>
        Add document
      </button>
    );
  }

  return (
    <div className="panel flat">
      <div className="panel-head">
        <h3>New knowledge document</h3>
        <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="field">
        <label htmlFor="doc-title">Title</label>
        <input id="doc-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="doc-body">Body</label>
        <textarea id="doc-body" rows={7} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="doc-scope">Access</label>
        <select id="doc-scope" value={form.accessScope} onChange={(event) => setForm({ ...form, accessScope: event.target.value })}>
          <option value="company">Company-wide</option>
          <option value="department">Department (needs a department id)</option>
          <option value="private">One employee only</option>
        </select>
      </div>
      {form.accessScope === "private" ? (
        <div className="field">
          <label htmlFor="doc-owner">Owning employee</label>
          <select id="doc-owner" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
            <option value="">Choose…</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <button className="btn primary" type="button" onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Save document"}
      </button>
      {error ? <p className="tiny" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

export function RoutineForm({ employees }: { employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "Weekly operating review",
    instructions: "Review active projects, blocked tasks and pending decisions. Produce a short written update.",
    employeeId: employees[0]?.id ?? "",
    intervalMinutes: 10080,
  });

  if (!open) {
    return (
      <button className="btn small" type="button" onClick={() => setOpen(true)}>
        Schedule routine
      </button>
    );
  }

  return (
    <div className="panel flat">
      <div className="panel-head">
        <h3>Recurring duty</h3>
        <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="field">
        <label htmlFor="routine-name">Name</label>
        <input id="routine-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="routine-instructions">Instructions</label>
        <textarea
          id="routine-instructions"
          rows={3}
          value={form.instructions}
          onChange={(event) => setForm({ ...form, instructions: event.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="routine-owner">Assigned employee</label>
          <select id="routine-owner" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="routine-interval">Every (minutes)</label>
          <input
            id="routine-interval"
            type="number"
            min={5}
            value={form.intervalMinutes}
            onChange={(event) => setForm({ ...form, intervalMinutes: Number(event.target.value) })}
          />
        </div>
      </div>
      <button
        className="btn primary"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await post("/api/routines", { ...form });
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not schedule the routine.");
            return;
          }
          setOpen(false);
          router.refresh();
        }}
      >
        {busy ? "Scheduling…" : "Schedule"}
      </button>
      {error ? <p className="tiny" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}
