import fs from "node:fs";
import Link from "next/link";
import { tryGetSession } from "@/lib/session";
import { humanHoldsControl, listActivity, listComputers, listEmployees } from "@/lib/domain/repo";
import { browserAvailability } from "@/lib/computers/browser";
import { getComputerAutonomy } from "@/lib/computers/autonomy";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { AutonomyControl } from "@/components/StaffConsole";

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
          <h1>Machines</h1>
          <p>
            Each employee has a persistent workspace and a command runner. Open a machine to watch files land, read the
            tool log, and decide how much freedom it gets. Taking control blocks the agent before its next action.
          </p>
        </div>
        <Badge tone={browser.available ? "ok" : "sim"}>
          Browser: {browser.available ? "available" : "not configured"}
        </Badge>
      </header>

      <div className="banner info">
        <span>
          Isolation boundary: workspaces are directories and commands run as the application user, not inside a VM.
          Guarded is the default; YOLO and host control are owner grants recorded in the audit trail.{" "}
          <span className="faint">{browser.reason}</span>
        </span>
      </div>

      <div className="grid two">
        {employees.map((employee) => {
          const computer = computers.find((candidate) => candidate.employeeId === employee.id);
          const files = computer ? countFiles(computer.workspacePath) : 0;
          const last = activity.find((event) => event.actorId === employee.id);
          const locked = humanHoldsControl(computer ?? null);
          const autonomy = getComputerAutonomy(company.id, employee.id);
          return (
            <Panel key={employee.id}>
              <div className="spread">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`dot ${employee.status}`} />
                    <h2 style={{ margin: 0, fontSize: 17 }}>{employee.name}</h2>
                    <Badge tone={employee.status === "working" ? "warn" : "default"}>{employee.status}</Badge>
                    {locked ? <Badge tone="info">owner in control</Badge> : null}
                  </div>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>
                    {employee.title} · {files} file(s)
                  </p>
                </div>
                <Link className="btn small" href={`/computers/${employee.id}`}>
                  Open machine
                </Link>
              </div>

              <dl className="kv tight" style={{ marginTop: 12 }}>
                <dt>Computer</dt>
                <dd>{computer?.status ?? "missing"}</dd>
                <dt>Workspace</dt>
                <dd className="mono tiny" style={{ wordBreak: "break-all" }}>{computer?.workspacePath ?? "—"}</dd>
                <dt>Browser</dt>
                <dd>{browser.available ? computer?.browserStatus ?? "available" : "not configured"}</dd>
                <dt>Last activity</dt>
                <dd>{last ? `${last.summary} · ${relativeTime(last.createdAt)}` : "none"}</dd>
              </dl>

              <div className="hr" />
              <AutonomyControl employeeId={employee.id} employeeName={employee.name} mode={autonomy.mode} compact />
            </Panel>
          );
        })}
      </div>

      {employees.length === 0 ? (
        <Panel>
          <Empty>No employees configured.</Empty>
        </Panel>
      ) : null}
    </div>
  );
}
