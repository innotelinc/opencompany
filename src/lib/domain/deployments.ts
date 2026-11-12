import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";

/**
 * Deployment timeline.
 *
 * Two things deploy this project: the box's systemd timer (which appends to a
 * local event file) and Coolify's push webhook (which only exists inside
 * Coolify's own API). Neither is readable without opening a journal, so this
 * module puts both into one list the owner can look at, and pairs each start with
 * its finish so a deployment has a duration instead of two orphaned lines.
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
    // A finish without a start (log trimmed, or Coolify-only) still counts.
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

interface CoolifyDeployment {
  uuid?: string;
  status?: string;
  commit?: string;
  created_at?: string;
  finished_at?: string;
}

/**
 * Coolify's own deployment list, when this host has a token for it. Returns the
 * reason it is empty, because "not configured" and "Coolify is down" are
 * different problems and the console should not conflate them.
 */
export async function coolifyDeployments(
  limit = 8,
): Promise<{ rows: DeploymentRow[]; error?: "not-configured" | string }> {
  const { deployment } = getConfig();
  if (!deployment.coolify.token || !deployment.coolify.appUuid) {
    return { rows: [], error: "not-configured" };
  }
  try {
    const response = await fetch(
      `${deployment.coolify.baseUrl}/api/v1/deployments/applications/${encodeURIComponent(deployment.coolify.appUuid)}`,
      {
        headers: { Authorization: `Bearer ${deployment.coolify.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(2_500),
      },
    );
    if (!response.ok) return { rows: [], error: `Coolify answered ${response.status}` };
    const body = (await response.json()) as CoolifyDeployment[] | { deployments?: CoolifyDeployment[] };
    const list = Array.isArray(body) ? body : (body.deployments ?? []);
    const rows = list
      .filter((entry) => entry.created_at)
      .slice(0, limit)
      .map((entry) => {
        const started = String(entry.created_at);
        const finished = entry.finished_at ? String(entry.finished_at) : undefined;
        const duration =
          finished && Number.isFinite(Date.parse(finished)) && Number.isFinite(Date.parse(started))
            ? Math.max(0, Date.parse(finished) - Date.parse(started))
            : undefined;
        return {
          source: "coolify" as const,
          commit: String(entry.commit ?? ""),
          status: String(entry.status ?? "unknown"),
          startedAt: started,
          finishedAt: finished,
          durationMs: duration,
          detail: entry.uuid ? `deployment ${entry.uuid}` : undefined,
        };
      });
    return { rows };
  } catch (error) {
    return { rows: [], error: `Coolify is unreachable from this host: ${String(error)}` };
  }
}

/**
 * One list for the owner: this host's deployments plus Coolify's, newest first.
 * `coolifyAvailable` is reported instead of hidden, so an empty Coolify section
 * reads as "not configured here" rather than "nothing was deployed".
 */
export async function deploymentFeed(limit = 12): Promise<{
  rows: DeploymentRow[];
  coolifyAvailable: boolean;
  note?: string;
}> {
  const local = groupDeployments(readDeployEvents());
  const remote = await coolifyDeployments();
  const rows = [...local, ...remote.rows]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
  const note =
    remote.error === "not-configured"
      ? "Coolify deployments are not visible from this host: set COOLIFY_TOKEN and COOLIFY_APP_UUID to include them."
      : remote.error
        ? `Coolify's deployments are missing from this list. ${remote.error}`
        : undefined;
  return { rows, coolifyAvailable: remote.rows.length > 0, note };
}
