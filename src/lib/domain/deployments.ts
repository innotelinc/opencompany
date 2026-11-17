import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";

/**
 * Deployment timeline.
 *
 * The box's systemd timer appends a start and a finish to a local event file as it
 * deploys. That file is not readable without opening a journal, so this module turns
 * it into a list the owner can look at, and pairs each start with its finish so a
 * deployment has a duration instead of two orphaned lines.
 */
export type DeploySource = "box" | "coolify";
export type DeployPhase = "start" | "finish";

export interface DeployEvent {
  at: string;
  source: DeploySource;
  phase: DeployPhase;
  /** started | succeeded | failed | cancelled | running */
  status: string;
  commit: string;
  detail?: string;
}

export interface DeploymentRow {
  source: DeploySource;
  commit: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  detail?: string;
}

const EVENT_FILE = "deploy-events.jsonl";
const MAX_EVENTS = 500;

export function deployEventsPath(): string {
  return path.join(getConfig().dataDir, EVENT_FILE);
}

/**
 * Append one event. Used by scripts/deploy.sh from the shell side and by the API
 * from the app side; a failure here must never fail a deployment, so callers get
 * a boolean instead of an exception.
 */
export function recordDeployEvent(event: DeployEvent): boolean {
  try {
    fs.mkdirSync(path.dirname(deployEventsPath()), { recursive: true });
    fs.appendFileSync(deployEventsPath(), `${JSON.stringify(event)}\n`);
    const lines = fs.readFileSync(deployEventsPath(), "utf8").trim().split("\n");
    if (lines.length > MAX_EVENTS) {
      fs.writeFileSync(deployEventsPath(), `${lines.slice(-MAX_EVENTS).join("\n")}\n`);
    }
    return true;
  } catch {
    return false;
  }
}

/** Read the events this host recorded, oldest first. Malformed lines are skipped. */
export function readDeployEvents(): DeployEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(deployEventsPath(), "utf8");
  } catch {
    return [];
  }
  const events: DeployEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<DeployEvent>;
      if (!parsed.at || !parsed.commit) continue;
      events.push({
        at: String(parsed.at),
        source: parsed.source === "coolify" ? "coolify" : "box",
        phase: parsed.phase === "finish" ? "finish" : "start",
        status: String(parsed.status ?? "unknown"),
        commit: String(parsed.commit),
        detail: parsed.detail ? String(parsed.detail) : undefined,
      });
    } catch {
      continue;
    }
  }
  return events;
}

/**
 * Pair starts with finishes per commit. A start with no finish is an in-flight
 * deployment; an unpaired start older than the newest finish is reported as such
 * rather than being dropped, because "nothing happened" is the wrong answer.
 */
export function groupDeployments(events: DeployEvent[]): DeploymentRow[] {
  const rows: DeploymentRow[] = [];
  const open = new Map<string, DeploymentRow>();

  for (const event of events) {
    const key = `${event.source}:${event.commit}`;
    if (event.phase === "start") {
      const existing = open.get(key);
      if (existing) {
        rows.push(existing);
      }
      const row: DeploymentRow = {
        source: event.source,
        commit: event.commit,
        status: "running",
        startedAt: event.at,
      };
      open.set(key, row);
      continue;
    }
    const row = open.get(key);
    if (row) {
      row.finishedAt = event.at;
      row.status = event.status;
      row.detail = event.detail;
      const started = Date.parse(row.startedAt);
      const finished = Date.parse(event.at);
      if (Number.isFinite(started) && Number.isFinite(finished)) {
        row.durationMs = Math.max(0, finished - started);
      }
      rows.push(row);
      open.delete(key);
      continue;
    }
    // A finish without a start (log trimmed) still counts.
    rows.push({
      source: event.source,
      commit: event.commit,
      status: event.status,
      startedAt: event.at,
      finishedAt: event.at,
      detail: event.detail,
    });
  }

  for (const row of open.values()) rows.push(row);

  return rows.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/** This host's deployments, newest first. */
export async function deploymentFeed(limit = 12): Promise<{ rows: DeploymentRow[] }> {
  return { rows: groupDeployments(readDeployEvents()).slice(0, limit) };
}
