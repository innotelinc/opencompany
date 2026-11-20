import type { Metadata } from "next";
import { approvalLinkByToken, decisionForLink } from "@/lib/domain/approvals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Approval — OPENco.",
};

/**
 * Where an approval email lands. It shows the exact action again, so the click in
 * the message never approves something the owner has not read, and the approval is
 * a POST from this page rather than the link itself.
 */
export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = approvalLinkByToken(token);
  const decision = link ? decisionForLink(link) : null;
  const expired = link ? Date.parse(link.expiresAt) <= Date.now() : false;
  const spent = Boolean(link?.usedAt);

  if (!link || !decision) {
    return (
      <section className="panel" style={{ maxWidth: 640, margin: "40px auto" }}>
        <div className="panel-head"><h2>That link is not valid</h2></div>
        <p className="small muted">
          It may have been copied incompletely. Sign in to the console and the decision will be waiting under Decisions.
        </p>
        <a className="btn" href="/decisions">Open decisions</a>
      </section>
    );
  }

  return (
    <section className="panel" style={{ maxWidth: 640, margin: "40px auto" }}>
      <div className="panel-head">
        <h2>{spent ? "Already answered" : expired ? "This approval expired" : "Waiting on you"}</h2>
        <span className="hint">{decision.kind.replace(/_/g, " ")}</span>
      </div>
      <p className="eyebrow" style={{ marginBottom: 4 }}>{decision.risk} risk</p>
      <h3 style={{ margin: "0 0 8px" }}>{decision.title}</h3>
      <p className="small muted">{decision.businessReason}</p>
      <pre className="mono pre tiny" style={{ background: "#11140f", padding: 12, borderRadius: 8, maxHeight: 300, overflow: "auto" }}>
        {JSON.stringify(decision.action, null, 2)}
      </pre>

      {spent || expired ? (
        <p className="small muted">
          Nothing else can be approved with this link. {spent ? "It was already used." : "Ask for a fresh one from the console."}
        </p>
      ) : decision.status !== "pending" ? (
        <p className="small muted">This decision is already {decision.status.replace(/_/g, " ")}.</p>
      ) : (
        <form method="post" action="/api/approvals/consume" style={{ marginTop: 12 }}>
          <input type="hidden" name="token" value={token} />
          <button className="btn primary" type="submit">Approve this exact action</button>
        </form>
      )}
      <p className="tiny faint" style={{ marginTop: 14 }}>
        Approval binds to the action shown above. If an employee changes the destination, content or cost, this
        approval is invalidated and the work comes back to you.
      </p>
    </section>
  );
}
