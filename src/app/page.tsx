import Link from "next/link";
import { tryGetSession } from "@/lib/session";
import { liveModelConfigured, getConfig } from "@/lib/config";
import { listActivity, listDecisions, listGoals, listReports } from "@/lib/domain/repo";
import { companyDashboard } from "@/lib/domain/ops";
import { Badge, Empty, Metric, Panel, Progress, SetupNotice, TaskStatus, relativeTime } from "@/components/ui";
import { ActionButton, BriefForm, DecisionActions } from "@/components/OwnerConsole";
import ChatPanel from "@/components/ChatPanel";

export const dynamic = "force-dynamic";

export default function BoardroomPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company, owner } = session;
  const goals = listGoals(company.id);
  const pending = listDecisions(company.id, "pending");
  const report = listReports(company.id)[0];
  const activity = listActivity(company.id, 24);
  const dash = companyDashboard(company.id);
  const employees = new Map(dash.employees.map((employee) => [employee.id, employee]));
  const live = liveModelConfigured();
  const activeTasks = dash.tasks.filter((task) => ["running", "pending", "awaiting_review", "awaiting_approval"].includes(task.status));
  const completed = dash.byStatus.completed ?? 0;

  const chatEnabled = Boolean(getConfig().openai.apiKey);
  const snapshot = {
    company: company.name,
    mission: company.mission,
    halted: Boolean(company.haltedAt),
    goals: goals.map((goal) => ({ id: goal.id, title: goal.title, status: goal.status })),
    pendingDecisions: pending.map((decision) => ({ id: decision.id, title: decision.title, kind: decision.kind })),
    budget: {
      committedCents: dash.budget.committedCents,
      limitCents: dash.budget.limitCents,
      remainingCents: dash.budget.remainingCents,
    },
    employees: dash.employees.map((employee) => ({ name: employee.name, title: employee.title, status: employee.status })),
    tasks: dash.tasks.slice(0, 20).map((task) => ({ title: task.title, status: task.status, kind: task.kind })),
  };

  return (
    <div className="stack" style={{ gap: 22 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Boardroom · {owner.name}, chair</p>
          <h1>{company.name}</h1>
          <p>{company.mission}</p>
        </div>
        <div className="row">
          <Badge tone={live ? "ok" : "sim"} title="Which agent backend is active">
            {live ? "LIVE agent work" : "SIMULATED work"}
          </Badge>
          <Badge tone={dash.worker.alive ? "ok" : "bad"}>
            {dash.worker.alive ? "Worker running" : "Worker offline"}
          </Badge>
        </div>
      </header>

      {company.haltedAt ? (
        <div className="banner">
          <span>
            <strong>Emergency stop active.</strong> {company.haltedReason} No new work will start. In-flight external
            actions cannot be recalled.
          </span>
          <ActionButton endpoint="/api/company" body={{ action: "resume" }} label="Resume operations" tone="btn primary small" />
        </div>
      ) : null}

      {dash.provider.coolingDown ? (
        <div className="banner info">
          <span>
            <strong>Model provider cooling down.</strong> Dispatch resumes in {dash.provider.cooldownSeconds}s
            {dash.provider.lastOutageReason ? ` — ${dash.provider.lastOutageReason}` : ""}. Tasks stay pending; nothing
            has failed and no attempt was spent.
          </span>
          <Link href="/admin" className="small">Provider detail →</Link>
        </div>
      ) : null}

      {!live ? (
        <div className="banner info">
          <span>
            <strong>Simulated mode.</strong> Employees perform real file work and real checks in isolated workspaces, but
            no model is called and nothing leaves this machine. Set <code>OPENCOMPANY_AGENT_BACKEND=llm</code> and{" "}
            <code>OPENAI_API_KEY</code> for live agent work.
          </span>
          <Link href="/admin" className="small">Administration →</Link>
        </div>
      ) : null}

      <div className="grid four">
        <Panel className="tight">
          <Metric label="Active goals" value={goals.filter((goal) => goal.status === "active").length} hint={`${goals.length} total`} />
        </Panel>
        <Panel className="tight">
          <Metric label="Work in flight" value={activeTasks.length} hint={`${completed} task(s) completed`} />
        </Panel>
        <Panel className="tight">
          <Metric
            label="Budget committed"
            value={`${(dash.budget.committedCents / 100).toFixed(2)}`}
            hint={`of ${(dash.budget.limitCents / 100).toFixed(2)} USD · ${dash.budget.remainingCents}¢ left`}
          />
          <div style={{ marginTop: 8 }}>
            <Progress value={dash.budget.committedCents} max={dash.budget.limitCents} />
          </div>
        </Panel>
        <Panel className="tight">
          <Metric
            label="Needs your decision"
            value={pending.length}
            hint={pending.length ? "Blocking authorized work" : "Nothing waiting"}
          />
        </Panel>
      </div>

      <div className="grid two">
        <div className="stack">
          <Panel
            title="Owner console"
            hint="Instruction → CEO plan → approval"
          >
            <BriefForm defaultBudget={Math.min(500, Math.max(100, dash.budget.remainingCents))} />
          </Panel>

          <Panel title="Decisions awaiting the owner" hint={`${pending.length} pending`}>
            {pending.length === 0 ? (
              <Empty>No decisions waiting. Authorized work continues without you.</Empty>
            ) : (
              <div className="stack">
                {pending.slice(0, 3).map((decision) => (
                  <div key={decision.id} className="panel flat">
                    <div className="spread">
                      <div>
                        <div className="row" style={{ gap: 6 }}>
                          <Badge tone={decision.kind === "public_deploy" ? "bad" : "warn"}>{decision.kind.replace(/_/g, " ")}</Badge>
                          <span className="tiny faint">{relativeTime(decision.createdAt)}</span>
                        </div>
                        <h3 style={{ margin: "6px 0 2px", fontSize: 14.5 }}>{decision.title}</h3>
                        <p className="small muted">{decision.businessReason}</p>
                        <p className="tiny faint">
                          Requested by {decision.requestedByEmployeeId ? employees.get(decision.requestedByEmployeeId)?.name ?? "an employee" : "system"}
                        </p>
                      </div>
                    </div>
                    <details>
                      <summary>Exact proposed action</summary>
                      <pre className="mono pre tiny">{JSON.stringify(decision.action, null, 2)}</pre>
                    </details>
                    <div style={{ marginTop: 10 }}>
                      <DecisionActions decisionId={decision.id} actionJson={JSON.stringify(decision.action)} />
                    </div>
                  </div>
                ))}
                {pending.length > 3 ? (
                  <Link href="/decisions" className="small">All {pending.length} decisions →</Link>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel title="Current operations" hint="Live task state">
            {activeTasks.length === 0 ? (
              <Empty>No task is running right now.</Empty>
            ) : (
              <table>
                <thead>
                  <tr><th>Task</th><th>Owner</th><th>State</th></tr>
                </thead>
                <tbody>
                  {activeTasks.slice(0, 8).map((task) => (
                    <tr key={task.id}>
                      <td>{task.title}</td>
                      <td className="muted small">{task.assigneeId ? employees.get(task.assigneeId)?.name : "—"}</td>
                      <td><TaskStatus status={task.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Latest CEO operating report" hint={report ? relativeTime(report.createdAt) : "not yet"}>
            {report ? (
              <pre className="pre small" style={{ margin: 0, color: "var(--ink-dim)" }}>{report.bodyMd}</pre>
            ) : (
              <Empty>The report is written when a project&apos;s work and review are complete.</Empty>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Chat with the company" hint="CopilotKit">
            <ChatPanel
              snapshot={snapshot}
              enabled={chatEnabled}
              reason="Set OPENAI_API_KEY to enable the CopilotKit assistant. Forms and buttons work without it."
            />
          </Panel>

          <Panel title="Activity" hint="Newest first">
            <div className="timeline">
              {activity.length === 0 ? <Empty>No activity yet. Submit a brief to start the loop.</Empty> : null}
              {activity.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <div className="when">{relativeTime(event.createdAt)} · {event.actorType}</div>
                  <div className="what">{event.summary}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Goals" hint={`${goals.length}`}>
            {goals.length === 0 ? (
              <Empty>No goals yet.</Empty>
            ) : (
              <ul className="list">
                {goals.slice(0, 8).map((goal) => (
                  <li key={goal.id}>
                    <span>
                      <span style={{ fontFamily: "var(--serif)" }}>{goal.title}</span>
                      <br />
                      <span className="tiny faint">{goal.budgetCents}¢ budget · {relativeTime(goal.createdAt)}</span>
                    </span>
                    <Badge tone={goal.status === "completed" ? "ok" : goal.status === "cancelled" ? "bad" : "info"}>
                      {goal.status}
                    </Badge>
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
