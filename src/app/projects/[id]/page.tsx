import Link from "next/link";
import { notFound } from "next/navigation";
import { tryGetSession } from "@/lib/session";
import {
  getProject,
  latestDeliverableVersion,
  listDecisions,
  listDeliverableVersions,
  listDeliverables,
  listDependencies,
  listEmployees,
  listRuns,
  listTasks,
} from "@/lib/domain/repo";
import { Badge, Empty, Panel, SetupNotice, TaskStatus, relativeTime } from "@/components/ui";
import { ActionButton } from "@/components/OwnerConsole";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { id } = await params;
  const project = getProject(session.company.id, id);
  if (!project) notFound();

  const tasks = listTasks(session.company.id, { projectId: project.id });
  const employees = new Map(listEmployees(session.company.id).map((employee) => [employee.id, employee.name]));
  const deliverables = listDeliverables(session.company.id).filter((deliverable) => deliverable.projectId === project.id);
  const decisions = listDecisions(session.company.id).filter((decision) => decision.projectId === project.id);
  const runs = listRuns(session.company.id).filter((run) => tasks.some((task) => task.id === run.taskId));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow"><Link href="/projects">Projects</Link> / {project.status}</p>
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
        <ActionButton endpoint={`/api/company`} body={{ action: "halt", reason: "Owner halted from project view." }} label="Emergency stop" tone="btn danger" confirmText="Stop all company work now?" />
      </header>

      <div className="grid two">
        <Panel title="Tasks" hint={`${tasks.length} total`}>
          <table>
            <thead>
              <tr><th>Task</th><th>Assignee</th><th>State</th><th></th></tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const dependencies = listDependencies(session.company.id, task.id);
                return (
                  <tr key={task.id}>
                    <td>
                      <div>{task.title}</div>
                      <div className="tiny faint">
                        {task.kind} · depth {task.delegationDepth} · attempts {task.attemptCount}/{task.maxAttempts}
                        {dependencies.length ? ` · depends on ${dependencies.length}` : ""}
                      </div>
                      {task.blockedReason ? <div className="tiny" style={{ color: "var(--danger)" }}>{task.blockedReason}</div> : null}
                    </td>
                    <td className="small muted">{task.assigneeId ? employees.get(task.assigneeId) ?? "—" : "—"}</td>
                    <td><TaskStatus status={task.status} /></td>
                    <td>
                      <div className="row" style={{ gap: 5 }}>
                        {!["completed", "cancelled"].includes(task.status) ? (
                          <ActionButton
                            endpoint={`/api/tasks/${task.id}`}
                            body={{ action: "cancel" }}
                            label="Cancel"
                            tone="btn small"
                            confirmText="Cancel this task and everything it delegated?"
                          />
                        ) : null}
                        {["blocked", "failed"].includes(task.status) ? (
                          <ActionButton endpoint={`/api/tasks/${task.id}`} body={{ action: "retry" }} label="Retry" tone="btn small" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tasks.length === 0 ? <Empty>No tasks.</Empty> : null}
        </Panel>

        <div className="stack">
          <Panel title="Deliverables" hint={`${deliverables.length}`}>
            {deliverables.length === 0 ? <Empty>Nothing delivered yet.</Empty> : null}
            {deliverables.map((deliverable) => {
              const version = latestDeliverableVersion(session.company.id, deliverable.id);
              const versions = listDeliverableVersions(session.company.id, deliverable.id);
              return (
                <div key={deliverable.id} className="stack" style={{ gap: 8, marginBottom: 14 }}>
                  <div className="spread">
                    <div>
                      <strong style={{ fontFamily: "var(--serif)" }}>{deliverable.name}</strong>
                      <div className="tiny faint">
                        v{deliverable.currentVersion} · {deliverable.kind} · {versions.length} version(s)
                      </div>
                    </div>
                    <Badge tone={deliverable.status === "approved" ? "ok" : deliverable.status === "checks_failed" ? "bad" : "warn"}>
                      {deliverable.status}
                    </Badge>
                  </div>
                  {version ? (
                    <>
                      <div className="row" style={{ gap: 4 }}>
                        {version.checks.map((check) => (
                          <Badge key={check.id} tone={check.passed ? "ok" : "bad"} title={check.detail}>
                            {check.id}
                          </Badge>
                        ))}
                      </div>
                      <iframe
                        className="preview-frame"
                        title={`Preview of ${deliverable.name}`}
                        src={`/api/preview/${deliverable.id}/${version.entryFile}`}
                        sandbox="allow-same-origin"
                      />
                      <Link className="small" href={`/api/preview/${deliverable.id}/${version.entryFile}`} target="_blank">
                        Open preview in new tab →
                      </Link>
                    </>
                  ) : (
                    <Empty>No artifact version.</Empty>
                  )}
                </div>
              );
            })}
          </Panel>

          <Panel title="Decisions for this project" hint={`${decisions.length}`}>
            {decisions.length === 0 ? (
              <Empty>No decisions.</Empty>
            ) : (
              <ul className="list">
                {decisions.map((decision) => (
                  <li key={decision.id}>
                    <span>
                      <span className="small">{decision.title}</span>
                      <br />
                      <span className="tiny faint">{relativeTime(decision.createdAt)}</span>
                    </span>
                    <Badge tone={decision.status === "pending" ? "warn" : decision.status === "approved" || decision.status === "auto_approved" ? "ok" : "default"}>
                      {decision.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Execution history" hint={`${runs.length} runs`}>
            {runs.length === 0 ? <Empty>No runs yet.</Empty> : (
              <table>
                <thead><tr><th>Attempt</th><th>Employee</th><th>Mode</th><th>Result</th></tr></thead>
                <tbody>
                  {runs.slice(0, 10).map((run) => (
                    <tr key={run.id}>
                      <td>#{run.attempt}</td>
                      <td className="small muted">{employees.get(run.employeeId)}</td>
                      <td className="small faint">{run.mode}</td>
                      <td>
                        <Badge tone={run.status === "succeeded" ? "ok" : run.status === "failed" || run.status === "interrupted" ? "bad" : "warn"}>
                          {run.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
