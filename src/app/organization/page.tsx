import Link from "next/link";
import { tryGetSession } from "@/lib/session";
import { listDepartments, listEmployees, listFormerEmployees, listGoals, listProjects, listTasks } from "@/lib/domain/repo";
import { getComputerAutonomy } from "@/lib/computers/autonomy";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { ActionButton } from "@/components/OwnerConsole";
import { AutonomyControl, FireButton, HireForm, TaskForm } from "@/components/StaffConsole";
import GoalsPanel from "@/components/GoalsConsole";

export const dynamic = "force-dynamic";

const AUTHORITY_COPY: Record<string, string> = {
  observe: "Observe & propose",
  internal: "Internal work",
  limited_external: "Delegated spend limits",
};

const OPEN_STATUSES = ["pending", "running", "awaiting_review", "blocked", "awaiting_approval"];

export default function OrganizationPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const employees = listEmployees(company.id);
  const former = listFormerEmployees(company.id);
  const departments = listDepartments(company.id);
  const projects = listProjects(company.id);
  const tasks = listTasks(company.id);
  const goals = listGoals(company.id);
  const departmentName = new Map(departments.map((department) => [department.id, department.name]));
  const employeeName = new Map(employees.map((employee) => [employee.id, employee.name]));

  const workload = (employeeId: string) => {
    const owned = tasks.filter((task) => task.assigneeId === employeeId);
    return {
      open: owned.filter((task) => OPEN_STATUSES.includes(task.status)).length,
      done: owned.filter((task) => task.status === "completed").length,
      active: owned.filter((task) => task.status === "running").length,
    };
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Organization</p>
          <h1>Staff</h1>
          <p>
            Hire, assign work and set how much machine each employee gets. Authority is enforced by the server on every
            dispatch and every tool call, so a change here takes effect on their next action.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <TaskForm
            employees={employees.map((employee) => ({ id: employee.id, name: employee.name }))}
            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
          />
          <HireForm
            departments={departments.map((department) => ({ id: department.id, name: department.name }))}
            employees={employees.map((employee) => ({ id: employee.id, name: employee.name }))}
          />
        </div>
      </header>

      <div className="grid three">
        <div className="metric-card">
          <span className="label">On staff</span>
          <span className="value">{employees.length}</span>
          <span className="hint">{departments.length} departments</span>
        </div>
        <div className="metric-card">
          <span className="label">Working now</span>
          <span className="value">{employees.filter((employee) => employee.status === "working").length}</span>
          <span className="hint">{tasks.filter((task) => task.status === "running").length} tasks running</span>
        </div>
        <div className="metric-card">
          <span className="label">Open work</span>
          <span className="value">{tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length}</span>
          <span className="hint">{tasks.filter((task) => task.status === "completed").length} completed</span>
        </div>
      </div>

      <Panel title="Goals" hint={`${goals.filter((goal) => goal.status === "active").length} active`}>
        <GoalsPanel
          goals={goals.map((goal) => ({
            id: goal.id,
            title: goal.title,
            description: goal.description,
            status: goal.status,
            budgetCents: goal.budgetCents,
          }))}
        />
      </Panel>

      <Panel title="Roster" hint={`${employees.length} people`}>
        {employees.length === 0 ? (
          <Empty>No employees yet. Hire the first one.</Empty>
        ) : (
          <div className="staff-grid">
            {employees.map((employee) => {
              const load = workload(employee.id);
              const autonomy = getComputerAutonomy(company.id, employee.id);
              return (
                <article className="staff-card" key={employee.id}>
                  <div className="staff-head">
                    <div>
                      <div className="row" style={{ gap: 8 }}>
                        <span className={`dot ${employee.status}`} />
                        <span className="emp-name">{employee.name}</span>
                        {employee.paused ? <Badge tone="info">paused</Badge> : null}
                      </div>
                      <div className="tiny faint">
                        {employee.title} · {departmentName.get(employee.departmentId ?? "") ?? "no department"}
                      </div>
                    </div>
                    <Badge
                      tone={
                        employee.status === "working"
                          ? "warn"
                          : employee.status === "error" || employee.status === "blocked"
                            ? "bad"
                            : "ok"
                      }
                    >
                      {employee.status}
                    </Badge>
                  </div>

                  <dl className="kv tight">
                    <dt>Reports to</dt>
                    <dd>{employee.managerId ? employeeName.get(employee.managerId) ?? "unknown" : "the owner"}</dd>
                    <dt>Authority</dt>
                    <dd>{AUTHORITY_COPY[employee.authority] ?? employee.authority}</dd>
                    <dt>Workload</dt>
                    <dd>
                      {load.open} open · {load.active} running · {load.done} done
                    </dd>
                    <dt>Tools</dt>
                    <dd className="mono tiny">{employee.allowedTools.join(", ") || "none"}</dd>
                  </dl>

                  <AutonomyControl
                    employeeId={employee.id}
                    employeeName={employee.name}
                    mode={autonomy.mode}
                    compact
                  />

                  <div className="row staff-actions">
                    <Link className="btn small ghost" href={`/computers/${employee.id}`}>
                      Open computer
                    </Link>
                    <TaskForm
                      employees={[{ id: employee.id, name: employee.name }]}
                      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                      defaultEmployeeId={employee.id}
                    />
                    <ActionButton
                      endpoint={`/api/employees/${employee.id}`}
                      body={{ action: employee.paused ? "resume" : "pause" }}
                      label={employee.paused ? "Resume" : "Pause"}
                      tone="btn small"
                    />
                    <FireButton
                      employeeId={employee.id}
                      name={employee.name}
                      openTasks={load.open}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid two">
        <Panel title="Departments" hint={`${departments.length}`}>
          <ul className="list">
            {departments.map((department) => (
              <li key={department.id}>
                <span>{department.name}</span>
                <span className="tiny faint">
                  {employees.filter((employee) => employee.departmentId === department.id).length} people
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Boundaries" hint="Server-enforced">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Authority</th>
                <th>Computer</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    {employee.name}
                    <br />
                    <span className="tiny faint">{employee.backend}</span>
                  </td>
                  <td className="small">{AUTHORITY_COPY[employee.authority]}</td>
                  <td>
                    <Badge tone={getComputerAutonomy(company.id, employee.id).mode === "guarded" ? "default" : "warn"}>
                      {getComputerAutonomy(company.id, employee.id).mode.replace(/_/g, " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny faint" style={{ marginTop: 10 }}>
            Guarded keeps an allowlist and the workspace boundary. YOLO runs any command inside that workspace. Host
            control runs from the host root and can change the machine — the application&apos;s own provider keys stay out
            of the child process in every mode.
          </p>
        </Panel>
      </div>

      <div className="grid two">
        <Panel title="Former employees" hint={`${former.length}`}>
          {former.length === 0 ? (
            <Empty>Nobody has left the company.</Empty>
          ) : (
            <ul className="list">
              {former.map((employee) => (
                <li key={employee.id}>
                  <span>
                    <span className="small">{employee.name}</span>
                    <br />
                    <span className="tiny faint">
                      {employee.title} · left {relativeTime(employee.terminatedAt)}
                      {employee.terminationReason ? ` · ${employee.terminationReason}` : ""}
                    </span>
                  </span>
                  <Badge tone="default">former</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent status changes" hint="Audit trail">
          {employees.length === 0 ? (
            <Empty>No employees.</Empty>
          ) : (
            <ul className="list">
              {[...employees]
                .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
                .slice(0, 6)
                .map((employee) => (
                  <li key={employee.id}>
                    <span className="small">{employee.name}</span>
                    <span className="tiny faint">updated {relativeTime(employee.updatedAt)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
