import Link from "next/link";
import { tryGetSession } from "@/lib/session";
import { listDeliverables, listEmployees, listGoals, listProjects, listTasks } from "@/lib/domain/repo";
import { Badge, Empty, Panel, SetupNotice, TaskStatus } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const projects = listProjects(company.id);
  const tasks = listTasks(company.id);
  const deliverables = listDeliverables(company.id);
  const employees = new Map(listEmployees(company.id).map((employee) => [employee.id, employee.name]));
  const goals = new Map(listGoals(company.id).map((goal) => [goal.id, goal.title]));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Projects</p>
          <h1>Goals → projects → tasks</h1>
          <p>
            Work is only created from an owner goal. Each task states its acceptance criteria and required checks;
            completion depends on a deliverable and an independent review, not on an agent saying it is done.
          </p>
        </div>
      </header>

      {projects.length === 0 ? (
        <Panel title="No projects yet">
          <Empty>Submit a brief in the Boardroom and approve the CEO&apos;s plan to create the first project.</Empty>
        </Panel>
      ) : (
        <div className="stack">
          {projects.map((project) => {
            const projectTasks = tasks.filter((task) => task.projectId === project.id);
            const projectDeliverables = deliverables.filter((deliverable) => deliverable.projectId === project.id);
            const done = projectTasks.filter((task) => task.status === "completed").length;
            return (
              <Panel key={project.id}>
                <div className="spread">
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <h2 style={{ margin: 0, fontSize: 18 }}>{project.name}</h2>
                      <Badge tone={project.status === "completed" ? "ok" : "info"}>{project.status}</Badge>
                    </div>
                    <p className="small muted" style={{ margin: "4px 0 0" }}>
                      {project.description || "No description."}
                    </p>
                    <p className="tiny faint">
                      Goal: {project.goalId ? goals.get(project.goalId) ?? "unknown" : "—"} · Manager:{" "}
                      {project.managerId ? employees.get(project.managerId) ?? "unknown" : "—"} ·{" "}
                      {done}/{projectTasks.length} tasks complete
                    </p>
                  </div>
                  <Link href={`/projects/${project.id}`} className="btn small">Open project</Link>
                </div>

                <div style={{ marginTop: 14 }}>
                  <table>
                    <thead>
                      <tr><th>Task</th><th>Assignee</th><th>Kind</th><th>State</th></tr>
                    </thead>
                    <tbody>
                      {projectTasks.slice(0, 6).map((task) => (
                        <tr key={task.id}>
                          <td>{task.title}</td>
                          <td className="small muted">{task.assigneeId ? employees.get(task.assigneeId) : "—"}</td>
                          <td className="small faint">{task.kind}</td>
                          <td><TaskStatus status={task.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {projectTasks.length === 0 ? <Empty>No tasks yet.</Empty> : null}
                </div>

                {projectDeliverables.length > 0 ? (
                  <p className="small" style={{ marginTop: 12, marginBottom: 0 }}>
                    Deliverables:{" "}
                    {projectDeliverables.map((deliverable) => (
                      <span key={deliverable.id} style={{ marginRight: 12 }}>
                        <Badge tone={deliverable.status === "approved" ? "ok" : deliverable.status === "checks_failed" ? "bad" : "warn"}>
                          {deliverable.name} v{deliverable.currentVersion}
                        </Badge>
                      </span>
                    ))}
                  </p>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
