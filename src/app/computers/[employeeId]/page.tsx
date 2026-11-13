import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tryGetSession } from "@/lib/session";
import { getComputerForEmployee, getEmployee, listActivity, listRunEvents, listRuns, listTasks } from "@/lib/domain/repo";
import { getComputerAutonomy, COMPUTER_AUTONOMY_COPY } from "@/lib/computers/autonomy";
import { browserAvailability } from "@/lib/computers/browser";
import { humanHoldsControl } from "@/lib/domain/repo";
import { Badge, Empty, Panel, SetupNotice, TaskStatus, relativeTime } from "@/components/ui";
import { ActionButton } from "@/components/OwnerConsole";
import { AutonomyControl, FireButton, TaskForm } from "@/components/StaffConsole";

export const dynamic = "force-dynamic";

const MAX_VIEW_BYTES = 200_000;

interface FileRow {
  path: string;
  bytes: number;
  modified: string;
}

function walkFiles(root: string, limit = 300): FileRow[] {
  const out: FileRow[] = [];
  const walk = (dir: string, prefix: string) => {
    if (out.length >= limit || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= limit) return;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
        continue;
      }
      const stat = fs.statSync(full);
      out.push({ path: rel, bytes: stat.size, modified: stat.mtime.toISOString() });
    }
  };
  walk(root, "");
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Read one file, refusing anything that resolves outside the workspace. */
function readInside(root: string, relative: string): string | null {
  const target = path.resolve(root, relative);
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  if (fs.statSync(target).size > MAX_VIEW_BYTES) return null;
  return fs.readFileSync(target, "utf8");
}

export default async function ComputerPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const { employeeId } = await params;
  const { file } = await searchParams;

  const employee = getEmployee(company.id, employeeId);
  if (!employee) notFound();
  const computer = getComputerForEmployee(company.id, employee.id);
  if (!computer) notFound();

  const autonomy = getComputerAutonomy(company.id, employee.id);
  const files = walkFiles(computer.workspacePath);
  const selectedPath = file && files.some((entry) => entry.path === file) ? file : files[0]?.path;
  const contents = selectedPath ? readInside(computer.workspacePath, selectedPath) : null;
  const runs = listRuns(company.id).filter((run) => run.employeeId === employee.id).slice(0, 12);
  const events = listRunEvents(company.id, { limit: 40 }).filter((event) => event.employeeId === employee.id);
  const tasks = listTasks(company.id).filter((task) => task.assigneeId === employee.id);
  const activity = listActivity(company.id, 80).filter((event) => event.actorId === employee.id);
  const locked = humanHoldsControl(computer);
  const browser = browserAvailability();

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/computers">Computers</Link> / {employee.name}
          </p>
          <h1>
            {employee.name} <span className="faint" style={{ fontSize: 18 }}>· {employee.title}</span>
          </h1>
          <p>
            Everything on this machine is visible here while it works: files as they are written, every run, and the
            command log. Taking control pauses the agent before its next action.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={employee.status === "working" ? "warn" : employee.status === "error" ? "bad" : "ok"}>
            {employee.status}
          </Badge>
          {locked ? (
            <ActionButton
              endpoint={`/api/computers/${employee.id}`}
              body={{ action: "release" }}
              label="Release control"
              tone="btn primary small"
            />
          ) : (
            <ActionButton
              endpoint={`/api/computers/${employee.id}`}
              body={{ action: "takeover" }}
              label="Take control"
              tone="btn small"
              confirmText={`Pause ${employee.name}'s agent and take control of this computer?`}
            />
          )}
        </div>
      </header>

      <div className="grid two">
        <Panel title="Machine" hint={autonomy.mode.replace(/_/g, " ")}>
          <dl className="kv">
            <dt>Status</dt>
            <dd>
              {computer.status} {locked ? <Badge tone="info">owner in control</Badge> : null}
            </dd>
            <dt>Workspace</dt>
            <dd className="mono tiny" style={{ wordBreak: "break-all" }}>{computer.workspacePath}</dd>
            <dt>Files</dt>
            <dd>{files.length} file(s)</dd>
            <dt>Browser</dt>
            <dd>{browser.available ? computer.browserStatus : "not configured"}</dd>
            <dt>Last seen</dt>
            <dd>{relativeTime(computer.lastSeenAt)}</dd>
            <dt>Authority</dt>
            <dd>{employee.authority.replace(/_/g, " ")} · {employee.allowedTools.join(", ") || "no tools"}</dd>
          </dl>
          <div className="hr" />
          <p className="tiny faint" style={{ marginTop: 0 }}>
            {COMPUTER_AUTONOMY_COPY[autonomy.mode].hint}
            {autonomy.grantedAt ? ` Granted ${relativeTime(autonomy.grantedAt)}.` : ""}
          </p>
          <AutonomyControl employeeId={employee.id} employeeName={employee.name} mode={autonomy.mode} />
        </Panel>

        <Panel title="In their computer" hint={selectedPath ?? "empty workspace"}>
          {files.length === 0 ? (
            <Empty>Nothing written yet. The workspace is created on first dispatch.</Empty>
          ) : (
            <div className="viewer">
              <ul className="file-list">
                {files.slice(0, 60).map((entry) => (
                  <li key={entry.path}>
                    <Link
                      href={`/computers/${employee.id}?file=${encodeURIComponent(entry.path)}`}
                      className={entry.path === selectedPath ? "file-link on" : "file-link"}
                    >
                      <span className="mono tiny">{entry.path}</span>
                      <span className="tiny faint">{Math.round(entry.bytes / 102.4) / 10} KB</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <pre className="file-view mono">{contents ?? "This file is binary or too large to display."}</pre>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid two">
        <Panel title="Their work" hint={`${tasks.length} task(s)`} action={<TaskForm employees={[{ id: employee.id, name: employee.name }]} defaultEmployeeId={employee.id} />}>
          {tasks.length === 0 ? (
            <Empty>No tasks assigned yet.</Empty>
          ) : (
            <ul className="list">
              {tasks.slice(0, 10).map((task) => (
                <li key={task.id}>
                  <span>
                    <span className="small">{task.title}</span>
                    <br />
                    <span className="tiny faint">
                      attempt {task.attemptCount}/{task.maxAttempts} · updated {relativeTime(task.updatedAt)}
                    </span>
                  </span>
                  <TaskStatus status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Runs" hint={`${runs.length} recent`}>
          {runs.length === 0 ? (
            <Empty>No runs yet.</Empty>
          ) : (
            <ul className="list">
              {runs.map((run) => (
                <li key={run.id}>
                  <span>
                    <span className="small">
                      attempt {run.attempt} · {run.mode}
                    </span>
                    <br />
                    <span className="tiny faint">{run.summary ?? run.error ?? "in progress"}</span>
                  </span>
                  <Badge tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "bad" : "info"}>
                    {run.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Command and tool log" hint="Newest first">
        {events.length === 0 ? (
          <Empty>No tool calls recorded yet.</Empty>
        ) : (
          <div className="timeline">
            {events.map((event) => (
              <div className="timeline-item" key={event.id}>
                <div className="when">
                  {event.type} · {relativeTime(event.createdAt)}
                </div>
                <div className="what">{event.message}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid two">
        <Panel title="Owner notes" hint="Audit trail">
          {activity.length === 0 ? (
            <Empty>Nothing recorded for this employee yet.</Empty>
          ) : (
            <ul className="list">
              {activity.slice(0, 6).map((event) => (
                <li key={event.id}>
                  <span className="small">{event.summary}</span>
                  <span className="tiny faint">{relativeTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Employment" hint="Reversible by hiring again">
          <p className="small muted">
            Firing removes this employee from the roster and cancels its open work. The record, its files, its tasks and
            its spending history are kept so the audit trail stays whole.
          </p>
          <div className="row">
            <FireButton
              employeeId={employee.id}
              name={employee.name}
              openTasks={tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
