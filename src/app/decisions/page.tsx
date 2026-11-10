import { tryGetSession } from "@/lib/session";
import { listDecisions, listEmployees } from "@/lib/domain/repo";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { DecisionActions } from "@/components/OwnerConsole";

export const dynamic = "force-dynamic";

const TONES: Record<string, "ok" | "warn" | "bad" | "info" | "default"> = {
  approved: "ok",
  auto_approved: "info",
  rejected: "bad",
  invalidated: "bad",
  revision_requested: "warn",
  pending: "warn",
};

export default function DecisionsPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company, owner } = session;
  const decisions = listDecisions(company.id);
  const pending = decisions.filter((decision) => decision.status === "pending");
  const resolved = decisions.filter((decision) => decision.status !== "pending");
  const employees = new Map(listEmployees(company.id).map((employee) => [employee.id, employee]));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Decisions</p>
          <h1>What needs the chair</h1>
          <p>
            Approvals bind to the exact action shown here. If an employee changes the destination, content or cost, the
            approval is invalidated and a new decision is required. {owner.name} is the only approver.
          </p>
        </div>
        <Badge tone={pending.length ? "warn" : "ok"}>{pending.length} pending</Badge>
      </header>

      {pending.length === 0 ? (
        <Panel title="Nothing waiting on you">
          <Empty>Authorized internal work continues without approval. Restricted actions will appear here.</Empty>
        </Panel>
      ) : (
        <div className="stack">
          {pending.map((decision) => (
            <Panel key={decision.id}>
              <div className="spread">
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={decision.risk === "high" ? "bad" : "warn"}>{decision.risk} risk</Badge>
                    <Badge>{decision.kind.replace(/_/g, " ")}</Badge>
                    <span className="tiny faint">requested {relativeTime(decision.createdAt)}</span>
                  </div>
                  <h2 style={{ margin: "8px 0 4px", fontSize: 18 }}>{decision.title}</h2>
                  <p className="small muted" style={{ margin: 0 }}>{decision.businessReason}</p>
                  <p className="tiny faint" style={{ marginTop: 6 }}>
                    Requested by{" "}
                    {decision.requestedByEmployeeId
                      ? `${employees.get(decision.requestedByEmployeeId)?.name ?? "employee"} (${employees.get(decision.requestedByEmployeeId)?.title ?? "unknown"})`
                      : "the system"}
                  </p>
                </div>
              </div>

              <div className="grid two" style={{ marginTop: 12 }}>
                <div>
                  <p className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}>Exact proposed action</p>
                  <pre className="mono pre tiny" style={{ background: "#11140f", padding: 12, borderRadius: 8, maxHeight: 260, overflow: "auto" }}>
                    {JSON.stringify(decision.action, null, 2)}
                  </pre>
                  <p className="tiny faint">Binding hash: <span className="mono">{decision.actionHash.slice(0, 24)}…</span></p>
                </div>
                <div>
                  <p className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}>Your decision</p>
                  <DecisionActions decisionId={decision.id} actionJson={JSON.stringify(decision.action)} />
                  <p className="tiny faint" style={{ marginTop: 12 }}>
                    Approving an external action does not guarantee it can be recalled once it starts. If a provider is
                    unavailable, the action will show a clear blocked state instead of pretending to succeed.
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel title="Decision history" hint={`${resolved.length}`}>
        {resolved.length === 0 ? (
          <Empty>No resolved decisions yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr><th>Decision</th><th>Kind</th><th>Status</th><th>Resolved</th></tr>
            </thead>
            <tbody>
              {resolved.map((decision) => (
                <tr key={decision.id}>
                  <td>
                    {decision.title}
                    {decision.invalidatedReason ? <div className="tiny" style={{ color: "var(--danger)" }}>{decision.invalidatedReason}</div> : null}
                    {decision.resolutionNote ? <div className="tiny faint">{decision.resolutionNote}</div> : null}
                  </td>
                  <td className="small faint">{decision.kind.replace(/_/g, " ")}</td>
                  <td><Badge tone={TONES[decision.status] ?? "default"}>{decision.status.replace(/_/g, " ")}</Badge></td>
                  <td className="small faint">{relativeTime(decision.decidedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
