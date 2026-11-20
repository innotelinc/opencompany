import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Approved — OPENco.",
};

export default function ApprovalDonePage() {
  return (
    <section className="panel" style={{ maxWidth: 560, margin: "40px auto" }}>
      <div className="panel-head">
        <h2>Approved</h2>
        <span className="hint">from your email link</span>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        The company has the approval it was waiting for and the audit trail records that it came from this link. The
        link is now spent.
      </p>
      <a className="btn primary" href="/decisions">See the decision</a>
    </section>
  );
}
