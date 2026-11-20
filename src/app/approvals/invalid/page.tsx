import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link not valid — OPENco.",
};

export default function ApprovalInvalidPage() {
  return (
    <section className="panel" style={{ maxWidth: 560, margin: "40px auto" }}>
      <div className="panel-head"><h2>That link is not valid</h2></div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Nothing was approved. Sign in to the console and the decision will be waiting under Decisions.
      </p>
      <a className="btn" href="/decisions">Open decisions</a>
    </section>
  );
}
