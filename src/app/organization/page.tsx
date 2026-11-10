import { tryGetSession } from "@/lib/session";
import { listDepartments, listEmployees, listTasks } from "@/lib/domain/repo";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { ActionButton, EmployeeForm } from "@/components/OwnerConsole";

export const dynamic = "force-dynamic";

const AUTHORITY_COPY: Record<string, string> = {
  observe: "Observe & propose",
  internal: "Internal work",
  limited_external: "Delegated spend limits",
};

export default function OrganizationPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const employees = listEmployees(company.id);
  const departments = listDepartments(company.id);
  const tasks = listTasks(company.id);
  const departmentName = new Map(departments.map((department) => [department.id, department.name]));
  const employeeName = new Map(employees.map((employee) => [employee.id, employee.name]));

  const workload = (employeeId: string) => {
    const owned = tasks.filter((task) => task.assigneeId === employeeId);
    return {
      open: owned.filter((task) => ["pending", "running", "awaiting_review", "blocked", "awaiting_approval"].includes(task.status)).length,
      done: owned.filter((task) => task.status === "completed").length,
    };
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Organization</p>
          <h1>People, reporting and permissions</h1>
          <p>
            Every employee is a persistent identity with its own computer, tools, budget and manager. Authority is
            enforced by the server on every dispatch and every tool call.
          </p>
        </div>
        <EmployeeForm
          departments={departments.map((department) => ({ id: department.id, name: department.name }))}
          employees={employees.map((employee) => ({ id: employee.id, name: employee.name }))}
        />
      </header>

      <div className="grid two">
        <Panel title="Reporting structure" hint={`${employees.length} employees`}>
          <div className="emp-tree">
            {employees.map((employee) => {
              const load = workload(employee.id);
              return (
                <div className="emp-row" key={employee.id}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`dot ${employee.status}`} />
                      <span className="emp-name">{employee.name}</span>
                      {employee.paused ? <Badge tone="info">paused</Badge> : null}
                    </div>
                    <div className="tiny faint">
                      {employee.title} · {departmentName.get(employee.departmentId ?? "") ?? "no department"} · reports to{" "}
                      {employee.managerId ? employeeName.get(employee.managerId) ?? "unknown" : "the owner"}
                    </div>
                  </div>
                  <div className="tiny muted">
                    <div>{AUTHORITY_COPY[employee.authority] ?? employee.authority}</div>
                    <div>{load.open} open · {load.done} done</div>
                    <div className="faint">{employee.concurrencyLimit} concurrent · {employee.spendLimitCents}¢ / action</div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Badge tone={employee.status === "working" ? "warn" : employee.status === "error" ? "bad" : employee.status === "blocked" ? "bad" : "ok"}>
                      {employee.status}
                    </Badge>
                    <ActionButton
                      endpoint={`/api/employees/${employee.id}`}
                      body={{ action: employee.paused ? "resume" : "pause" }}
                      label={employee.paused ? "Resume" : "Pause"}
                      tone="btn small"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="stack">
          <Panel title="What each employee may do" hint="Server-enforced">
            <table>
              <thead>
                <tr><th>Employee</th><th>Authority</th><th>Tools</th></tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.name}<br /><span className="tiny faint">{employee.backend}</span></td>
                    <td className="small">{AUTHORITY_COPY[employee.authority]}</td>
                    <td className="tiny mono">{employee.allowedTools.join(", ") || "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

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

          <Panel title="Recent status changes" hint="Audit trail">
            {employees.length === 0 ? <Empty>No employees.</Empty> : (
              <ul className="list">
                {employees.slice(0, 5).map((employee) => (
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
    </div>
  );
}
