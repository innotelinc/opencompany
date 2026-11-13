import { getSession } from "@/lib/session";
import { listActivity, listEmployees, listTasks } from "@/lib/domain/repo";
import { workerStatus } from "@/lib/domain/ops";
import { ok, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One small, always-cheap snapshot for the live strip: who is working, what
 * changed last, and whether the worker is breathing. It is polled by the shell
 * rather than pushed, because the app must keep showing the truth even when a
 * stream is blocked by a proxy.
 */
export async function GET() {
  try {
    const session = getSession();
    const companyId = session.company.id;
    const tasks = listTasks(companyId);
    const employees = listEmployees(companyId);
    const worker = workerStatus();
    const open = ["pending", "running", "blocked", "awaiting_review", "awaiting_approval"];
    const activity = listActivity(companyId, 8).map((event) => ({
      id: event.id,
      type: event.type,
      summary: event.summary,
      actorType: event.actorType,
      actorId: event.actorId,
      at: event.createdAt,
    }));

    return ok({
      at: new Date().toISOString(),
      halted: Boolean(session.company.haltedAt),
      worker: { alive: worker.alive, ageSeconds: worker.ageSeconds },
      counts: {
        employees: employees.length,
        working: employees.filter((employee) => employee.status === "working").length,
        open: tasks.filter((task) => open.includes(task.status)).length,
        running: tasks.filter((task) => task.status === "running").length,
        completed: tasks.filter((task) => task.status === "completed").length,
        blocked: tasks.filter((task) => task.status === "blocked").length,
      },
      activity,
    });
  } catch (error) {
    return unexpected(error);
  }
}
