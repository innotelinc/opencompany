import { getDb, parseJson } from "@/lib/db";
import { listExternalActions, listDeliverables, listEmployees, listTasks } from "@/lib/domain/repo";
import { budgetSnapshot } from "@/lib/domain/budget";
import { getPolicies } from "@/lib/domain/repo";

export function workerStatus(): { alive: boolean; workerId: string | null; lastHeartbeat: string | null; ageSeconds: number | null } {
  const row = getDb()
    .prepare("SELECT owner, updated_at FROM leases WHERE name = 'worker'")
    .get() as { owner?: string; updated_at?: string } | undefined;
  if (!row?.updated_at) return { alive: false, workerId: null, lastHeartbeat: null, ageSeconds: null };
  const ageSeconds = Math.round((Date.now() - Date.parse(row.updated_at)) / 1000);
  return {
    alive: ageSeconds < 20,
    workerId: row.owner ?? null,
    lastHeartbeat: row.updated_at,
    ageSeconds,
  };
}

export function companyDashboard(companyId: string) {
  const tasks = listTasks(companyId);
  const employees = listEmployees(companyId);
  const deliverables = listDeliverables(companyId);
  const externalActions = listExternalActions(companyId);
  const policies = getPolicies(companyId);
  const budget = budgetSnapshot(companyId, policies);

  const byStatus: Record<string, number> = {};
  for (const task of tasks) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;

  const recentEvents = getDb()
    .prepare("SELECT payload, type FROM run_events WHERE company_id = ? ORDER BY created_at DESC LIMIT 40")
    .all(companyId)
    .map((row: any) => ({ type: row.type as string, payload: parseJson<Record<string, unknown>>(row.payload, {}) }));

  return {
    tasks,
    employees,
    deliverables,
    externalActions,
    budget,
    policies,
    byStatus,
    recentEvents,
    worker: workerStatus(),
  };
}
