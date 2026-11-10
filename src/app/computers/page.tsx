import fs from "node:fs";
import { tryGetSession } from "@/lib/session";
import { listActivity, listComputers, listEmployees } from "@/lib/domain/repo";
import { browserAvailability } from "@/lib/computers/browser";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { ActionButton } from "@/components/OwnerConsole";

export const dynamic = "force-dynamic";

function countFiles(root: string): number {
  let count = 0;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".browser" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else count += 1;
    }
  };
  walk(root.replace(/\\/g, "/"));
  return count;
}

export default function ComputersPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const employees = listEmployees(company.id);
  const computers = listComputers(company.id);
  const activity = listActivity(company.id, 60);
  const browser = browserAvailability();

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Computers</p>
          <h1>Employee workspaces</h1>
          <p>
            Each employee has a persistent workspace directory and a restricted process runner. Taking control blocks
            the agent before its next action; the lock expires on its own after 15 minutes.
          </p>
        </div>
        <Badge tone={browser.available ? "ok" : "sim"}>
          Browser: {browser.available ? "available" : "not configured"}
        </Badge>
      </header>

      <div className="banner info">
        <span>
          Isolation boundary: workspaces are directories and commands run as the application user, not inside a VM.
          Run the worker in a container before letting untrusted agents execute code.{" "}
          <span className="faint">{browser.reason}</span>
        </span>
      </div>

      <div className="grid two">
        {employees.map((employee) => {
          const computer = computers.find((candidate) => candidate.employeeId === employee.id);
          const files = computer ? countFiles(computer.workspacePath) : 0;
          const last = activity.find((event) => event.actorId === employee.id);
          const locked = computer?.humanLockUntil ? Date.parse(computer.humanLockUntil) > Date.now() : false;
          return (
            <Panel key={employee.id}>
              <div className="spread">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`dot ${employee.status}`} />
                    <h2 style={{ margin: 0, fontSize: 17 }}>{employee.name}</h2>
                    <Badge tone={employee.status === "working" ? "warn" : "default"}>{employee.status}</Badge>
                  </div>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>{employee.title}</p>
                </div>
                <div className="row" style={{ gap: 6 }}>
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
                      confirmText="Pause this employee's agent and take control of its computer?"
                    />
                  )}
                </div>
              </div>

              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Computer</dt>
                <dd>{computer?.status ?? "missing"} {locked ? <Badge tone="info">owner in control</Badge> : null}</dd>
                <dt>Workspace</dt>
                <dd className="mono tiny">{computer?.workspacePath ?? "—"}</dd>
                <dt>Files</dt>
                <dd>{files} file(s)</dd>
                <dt>Browser</dt>
                <dd>{browser.available ? computer?.browserStatus ?? "available" : "not configured"}</dd>
                <dt>Last activity</dt>
                <dd>{last ? `${last.summary} · ${relativeTime(last.createdAt)}` : "none"}</dd>
                <dt>Tools</dt>
                <dd className="mono tiny">{employee.allowedTools.join(", ")}</dd>
              </dl>
            </Panel>
          );
        })}
      </div>

      {employees.length === 0 ? <Panel><Empty>No employees configured.</Empty></Panel> : null}
    </div>
  );
}
