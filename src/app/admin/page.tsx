import { tryGetSession } from "@/lib/session";
import { getConfig, liveModelConfigured } from "@/lib/config";
import {
  listEmployees,
  listExternalActions,
  listLedger,
  listReports,
  listRoutines,
  listTasks,
} from "@/lib/domain/repo";
import { budgetSnapshot } from "@/lib/domain/budget";
import { getPolicies } from "@/lib/domain/repo";
import { workerStatus } from "@/lib/domain/ops";
import { ALL_CHECKS, checkDescription } from "@/lib/engine/checks";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { ActionButton, RoutineForm } from "@/components/OwnerConsole";

export const dynamic = "force-dynamic";

export default function AdministrationPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const config = getConfig();
  const employees = listEmployees(company.id);
  const policies = getPolicies(company.id);
  const budget = budgetSnapshot(company.id, policies);
  const ledger = listLedger(company.id, 40);
  const external = listExternalActions(company.id);
  const reports = listReports(company.id);
  const routines = listRoutines(company.id);
  const worker = workerStatus();
  const unknown = listTasks(company.id).filter((task) => task.status === "blocked");

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Models, policies, money and audit</h1>
          <p>
            Provider credentials live in server environment variables and are never sent to the browser or written into
            prompts. This first version has one owner and one company; the schema and every query are company-scoped.
          </p>
        </div>
        <div className="row">
          <Badge tone={liveModelConfigured() ? "ok" : "sim"}>{liveModelConfigured() ? "live model" : "simulated"}</Badge>
          <Badge tone={worker.alive ? "ok" : "bad"}>{worker.alive ? `worker ${worker.ageSeconds}s` : "worker offline"}</Badge>
        </div>
      </header>

      <div className="grid two">
        <Panel title="Runtime" hint="Server-side">
          <dl className="kv">
            <dt>Company</dt><dd>{company.name} ({company.slug})</dd>
            <dt>Company id</dt><dd className="mono tiny">{company.id}</dd>
            <dt>Agent backend</dt><dd>{config.agentBackend}</dd>
            <dt>Model</dt><dd className="mono tiny">{config.model}</dd>
            <dt>Provider base</dt><dd className="mono tiny">{config.openai.baseUrl}</dd>
            <dt>Model key</dt><dd>{config.openai.apiKey ? "configured on server" : "not set"}</dd>
            <dt>Database</dt><dd className="mono tiny">{config.dbPath}</dd>
            <dt>Data dir</dt><dd className="mono tiny">{config.dataDir}</dd>
            <dt>Browser sessions</dt><dd>{config.limits.browserEnabled ? "enabled (Playwright)" : "disabled"}</dd>
            <dt>Worker</dt><dd>{worker.alive ? `${worker.workerId} · ${relativeTime(worker.lastHeartbeat)}` : "no heartbeat in the last 20s"}</dd>
            <dt>Emergency stop</dt><dd>{company.haltedAt ? `ACTIVE — ${company.haltedReason}` : "not active"}</dd>
          </dl>
          <div className="row" style={{ marginTop: 12 }}>
            <ActionButton
              endpoint="/api/company"
              body={{ action: company.haltedAt ? "resume" : "halt", reason: "Owner toggled emergency stop from Administration." }}
              label={company.haltedAt ? "Resume company" : "Emergency stop"}
              tone={company.haltedAt ? "btn primary small" : "btn danger small"}
            />
            {unknown.length ? <span className="tiny faint">{unknown.length} blocked task(s) need attention</span> : null}
          </div>
        </Panel>

        <Panel title="Budgets and usage" hint="Estimates are not invoices">
          <div className="grid three" style={{ marginBottom: 12 }}>
            <div className="metric"><span className="label">Limit</span><span className="value">{(budget.limitCents / 100).toFixed(2)}</span><span className="hint">USD / month</span></div>
            <div className="metric"><span className="label">Committed</span><span className="value">{(budget.committedCents / 100).toFixed(2)}</span><span className="hint">estimates + usage</span></div>
            <div className="metric"><span className="label">Tokens</span><span className="value">{budget.modelTokensIn + budget.modelTokensOut}</span><span className="hint">recorded</span></div>
          </div>
          <table>
            <thead><tr><th>Kind</th><th>Category</th><th className="num">Cents</th><th>Note</th></tr></thead>
            <tbody>
              {ledger.length === 0 ? <tr><td colSpan={4}><Empty>No ledger entries yet.</Empty></td></tr> : null}
              {ledger.slice(0, 12).map((entry) => (
                <tr key={entry.id} style={{ opacity: entry.supersededBy ? 0.45 : 1 }}>
                  <td className="small">{entry.kind}</td>
                  <td className="small faint">{entry.category}</td>
                  <td className="num small">{entry.amountCents}</td>
                  <td className="tiny faint">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny faint" style={{ marginTop: 10 }}>
            Verified provider charges appear only when a provider reports them. Model pricing is not configured, so token
            usage is recorded without inventing a dollar amount.
          </p>
        </Panel>
      </div>

      <div className="grid two">
        <Panel title="Policies" hint="Server-enforced at dispatch">
          <table>
            <thead><tr><th>Key</th><th>Value</th></tr></thead>
            <tbody>
              {Object.entries(policies).map(([key, value]) => (
                <tr key={key}>
                  <td className="mono tiny">{key}</td>
                  <td className="mono tiny">{JSON.stringify(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Checks available to tasks" hint="Real inspections">
          <ul className="list">
            {ALL_CHECKS.map((check) => (
              <li key={check}>
                <span className="mono tiny">{check}</span>
                <span className="tiny faint" style={{ maxWidth: "55%", textAlign: "right" }}>{checkDescription(check)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid two">
        <Panel
          title="External actions"
          hint={`${external.length}`}
          action={
            <span className="row">
              <RoutineForm employees={employees.map((employee) => ({ id: employee.id, name: employee.name }))} />
            </span>
          }
        >
          {external.length === 0 ? <Empty>No external action has been approved yet.</Empty> : (
            <table>
              <thead><tr><th>Kind</th><th>Target</th><th>Status</th><th>Result</th></tr></thead>
              <tbody>
                {external.map((action) => (
                  <tr key={action.id}>
                    <td className="small">{action.kind}</td>
                    <td className="small faint">{action.target}</td>
                    <td>
                      <Badge tone={action.status === "succeeded" ? "ok" : action.status === "blocked" || action.status === "uncertain" ? "warn" : action.status === "failed" ? "bad" : "info"}>
                        {action.status}
                      </Badge>
                    </td>
                    <td className="tiny faint">{action.result ? String(action.result.reason ?? JSON.stringify(action.result).slice(0, 120)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="tiny faint" style={{ marginTop: 10 }}>
            A row left in <code>executing</code> is marked uncertain after five minutes and is never retried
            automatically: the external effect may already have happened.
          </p>
        </Panel>

        <Panel title="Routines" hint={`${routines.length}`}>
          {routines.length === 0 ? <Empty>No recurring duties scheduled.</Empty> : (
            <ul className="list">
              {routines.map((routine) => (
                <li key={routine.id}>
                  <span>
                    <span className="small">{routine.name}</span>
                    <br />
                    <span className="tiny faint">every {routine.intervalMinutes}m · next {relativeTime(routine.nextRunAt)}</span>
                  </span>
                  <Badge tone={routine.enabled ? "ok" : "default"}>{routine.enabled ? "enabled" : "off"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid two">
        <Panel title="Operating reports" hint={`${reports.length}`}>
          {reports.length === 0 ? <Empty>No reports yet.</Empty> : (
            <ul className="list">
              {reports.map((report) => (
                <li key={report.id}>
                  <span className="small">{report.title}</span>
                  <span className="tiny faint">{relativeTime(report.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Licensing and dependency path" hint="Read docs/LICENSING.md">
          <p className="small muted">
            OpenCompany is MIT-licensed application code, written for this project. It uses CopilotKit packages
            (MIT, pinned 1.85.0) for chat and AG-UI interaction, Next.js (MIT) and better-sqlite3 (MIT).
          </p>
          <p className="small muted">
            The inspected upstream templates (OpenBot, OpenDuet, OpenMuse, OpenDots, Suparagent) are MIT or Apache-2.0
            application templates, but several depend on <strong>CopilotKit Intelligence</strong>, which is separately
            licensed and not redistributed here. No upstream source was copied into this repository.
          </p>
          <p className="small muted">
            No voice, mobile, marketplace, email or public deployment provider is configured. Those paths return an
            explicit blocked state rather than a simulated success.
          </p>
        </Panel>
      </div>
    </div>
  );
}
