import type { ReactNode } from "react";

export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title ? (
        <div className="panel-head">
          <h2>{title}</h2>
          {action ?? (hint ? <span className="hint">{hint}</span> : null)}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({
  tone = "default",
  children,
  title,
}: {
  tone?: "default" | "ok" | "warn" | "bad" | "info" | "sim";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`badge ${tone === "default" ? "" : tone}`} title={title}>
      {children}
    </span>
  );
}

const TASK_TONES: Record<string, "default" | "ok" | "warn" | "bad" | "info"> = {
  completed: "ok",
  running: "warn",
  pending: "info",
  awaiting_review: "warn",
  awaiting_approval: "warn",
  blocked: "bad",
  failed: "bad",
  cancelled: "default",
};

export function TaskStatus({ status }: { status: string }) {
  return <Badge tone={TASK_TONES[status] ?? "default"}>{status.replace(/_/g, " ")}</Badge>;
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted small" style={{ margin: 0 }}>{children}</p>;
}

export function SetupNotice({ message }: { message?: string }) {
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <p className="eyebrow">First run</p>
      <h1 style={{ margin: 0 }}>The company isn&apos;t set up yet</h1>
      <Panel>
        <p>{message ?? "No seeded company was found."}</p>
        <p className="small muted">From the project directory run:</p>
        <pre className="mono pre">npm run db:seed</pre>
        <p className="small muted">
          Then start the worker in a second terminal so authorized work advances:{" "}
          <code>npm run worker</code>
        </p>
      </Panel>
    </div>
  );
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
