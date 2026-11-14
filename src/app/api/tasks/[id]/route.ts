import { getSession } from "@/lib/session";
import { cancelTaskTree, reassignTask, retryTask } from "@/lib/domain/commands";
import { getTask } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession();
    const { id } = await context.params;
    const body = await readJson<{
      action?: "cancel" | "retry" | "reassign";
      reason?: string;
      employeeId?: string;
    }>(request);
    const task = getTask(session.company.id, id);
    if (!task) return fail("Task not found in this company.", 404);

    if (body.action === "cancel") {
      const cancelled = cancelTaskTree({
        companyId: session.company.id,
        taskId: id,
        actorId: session.owner.id,
        reason: body.reason,
      });
      return ok({ cancelled });
    }
    if (body.action === "retry") {
      retryTask({ companyId: session.company.id, taskId: id, actorId: session.owner.id });
      return ok();
    }
    if (body.action === "reassign") {
      if (!body.employeeId) return fail("Choose the employee who should own this task.");
      reassignTask({
        companyId: session.company.id,
        actorId: session.owner.id,
        taskId: id,
        employeeId: body.employeeId,
      });
      return ok();
    }
    return fail("Unknown task action.");
  } catch (error) {
    return unexpected(error);
  }
}
