"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Position } from "@/lib/domain/setup";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) return { ok: false, error: payload.error ?? `Request failed (${response.status}).` };
  return { ok: true };
}

export function CompanyIdentityForm({
  company,
}: {
  company: { name: string; mission: string; operatingPrinciples: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [mission, setMission] = useState(company.mission);
  const [principles, setPrinciples] = useState(company.operatingPrinciples);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await post("/api/company", {
      action: "update",
      name,
      mission,
      operatingPrinciples: principles,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the company profile.");
      return;
    }
    setMessage("Company profile saved.");
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="co-name">Company name</label>
        <input id="co-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="co-mission">Mission</label>
        <textarea id="co-mission" rows={3} value={mission} onChange={(event) => setMission(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="co-principles">Operating principles</label>
        <textarea
          id="co-principles"
          rows={6}
          value={principles}
          onChange={(event) => setPrinciples(event.target.value)}
        />
      </div>
      <div className="row">
        <button className="btn primary" type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save company profile"}
        </button>
        {message ? <span className="tiny">{message}</span> : null}
        {error ? <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span> : null}
      </div>
    </div>
  );
}

export function DepartmentManager({
  departments,
}: {
  departments: { id: string; name: string; people: number }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const result = await post("/api/company", { action: "department.create", name });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create the department.");
      return;
    }
    setName("");
    router.refresh();
  }

  async function rename(id: string, next: string) {
    setError(null);
    const result = await post("/api/company", { action: "department.rename", departmentId: id, name: next });
    if (!result.ok) {
      setError(result.error ?? "Could not rename the department.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <ul className="list">
        {departments.map((department) => (
          <li key={department.id}>
            <input
              defaultValue={department.name}
              aria-label={`Rename ${department.name}`}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== department.name) rename(department.id, next);
              }}
            />
            <span className="tiny faint">{department.people} people</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <input
          placeholder="New department"
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{ maxWidth: 240 }}
        />
        <button className="btn small" type="button" disabled={busy} onClick={create}>
          {busy ? "Adding…" : "Add department"}
        </button>
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>
        Rename a department by editing its name and leaving the field.
      </p>
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}

export function PositionEditor({ positions }: { positions: Position[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(positions);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(key: string, patch: Partial<Position>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function save(row: Position) {
    setBusy(row.key);
    setError(null);
    setMessage(null);
    const result = await post("/api/company", {
      action: "position.save",
      key: row.key,
      name: row.name,
      alias: row.alias,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "Could not save the position.");
      return;
    }
    setMessage(`Saved ${row.name}${row.alias ? ` (${row.alias})` : ""}.`);
    router.refresh();
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    setMessage(null);
    const result = await post("/api/company", { action: "position.reset" });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "Could not reset positions.");
      return;
    }
    setRows(positions);
    setMessage("Positions reset to the standard titles.");
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>Display name</th>
            <th>Alias</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="tiny mono">{row.key}</td>
              <td>
                <input
                  aria-label={`Name for ${row.key}`}
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Alias for ${row.key}`}
                  value={row.alias}
                  onChange={(event) => update(row.key, { alias: event.target.value })}
                />
              </td>
              <td>
                <button className="btn small" type="button" disabled={busy === row.key} onClick={() => save(row)}>
                  {busy === row.key ? "…" : "Save"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn ghost small" type="button" disabled={busy === "reset"} onClick={reset}>
          Reset to standard titles
        </button>
        {message ? <span className="tiny">{message}</span> : null}
        {error ? <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span> : null}
      </div>
    </div>
  );
}

export function WorkTitleEditor({
  employees,
  positions,
}: {
  employees: { id: string; name: string; title: string }[];
  positions: Position[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(employees);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string, title: string) {
    setBusy(id);
    setError(null);
    const result = await post("/api/company", { action: "employee.title", employeeId: id, title });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "Could not update the work title.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <datalist id="position-titles">
        {positions
          .flatMap((position) => [position.name, position.alias].filter(Boolean))
          .map((title) => (
            <option key={title} value={title} />
          ))}
      </datalist>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Work title</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>
                <input
                  list="position-titles"
                  aria-label={`Work title for ${row.name}`}
                  value={row.title}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((candidate) =>
                        candidate.id === row.id ? { ...candidate, title: event.target.value } : candidate,
                      ),
                    )
                  }
                />
              </td>
              <td>
                <button className="btn small" type="button" disabled={busy === row.id} onClick={() => save(row.id, row.title)}>
                  {busy === row.id ? "…" : "Save"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
