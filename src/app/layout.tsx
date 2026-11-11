import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { tryGetSession } from "@/lib/session";
import { getConfig, liveModelConfigured } from "@/lib/config";
import { listDecisions } from "@/lib/domain/repo";
import { workerStatus } from "@/lib/domain/ops";
import LiveRefresh from "@/components/LiveRefresh";
import { NavLink } from "@/components/NavLink";

export const metadata: Metadata = {
  title: "OpenCompany — AI Company Operating System",
  description: "AI employees run authorized work; the human owner holds authority, budget and approvals.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = tryGetSession();
  const mode = liveModelConfigured() ? "LIVE" : "SIMULATED";
  const config = getConfig();
  const pending = session ? listDecisions(session.company.id, "pending") : [];
  const worker = session ? workerStatus() : null;

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="brand-mark">C</span>
              <span>
                <span className="brand-name">OpenCompany</span>
                <br />
                <span className="brand-sub">AI Company OS</span>
              </span>
            </Link>

            <nav className="nav">
              <NavLink href="/">Boardroom</NavLink>
              <NavLink href="/organization">Organization</NavLink>
              <NavLink href="/company">Company setup</NavLink>
              <NavLink href="/projects">Projects</NavLink>
              <NavLink href="/computers">Computers</NavLink>
              <NavLink href="/knowledge">Knowledge</NavLink>
              <NavLink href="/decisions">
                Decisions {pending.length > 0 ? <span className="nav-count">{pending.length}</span> : null}
              </NavLink>
              <NavLink href="/admin">Administration</NavLink>
              <a href="/site" target="_blank" rel="noreferrer" style={{ opacity: 0.85 }}>
                Public site ↗
              </a>
            </nav>

            <div className="sidebar-foot">
              <span>
                {session ? session.company.name : "No company"} ·{" "}
                <span className={mode === "LIVE" ? "badge ok" : "badge sim"}>{mode}</span>
              </span>
              <span className="tiny">
                {worker?.alive ? `Worker alive (${worker.ageSeconds}s)` : "Worker offline — work will not advance"}
              </span>
              <span className="tiny">
                Backend: {config.agentBackend} · owner {session?.owner.email ?? "—"}
              </span>
            </div>
          </aside>
          <main className="main">
            {session ? <LiveRefresh seconds={5} /> : null}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
