import { getSession } from "@/lib/session";
import { createAdHocTask } from "@/lib/domain/commands";
import { listTasks } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = getSession();
    return ok({ tasks: listTasks(session.company.id) });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * The owner assigns work directly to one employee, outside the CEO's planning
 * loop. The task lands in the same durable queue the planners use, so it gets
 * the same checks, review and recovery once the worker picks it up.
 */
export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      employeeId?: string;
      projectId?: string | null;
    }>(request);

    if (!body.title?.trim()) return fail("A task title is required.");
    if (!body.employeeId) return fail("Choose the employee who owns this task.");

    const taskId = createAdHocTask({
      companyId: session.company.id,
      actorId: session.owner.id,
      title: body.title.trim(),
      description: body.description?.trim() ?? "",
      acceptanceCriteria: body.acceptanceCriteria?.trim() || "The requested work is delivered and passes its checks.",
      employeeId: body.employeeId,
      projectId: body.projectId ?? null,
    });

    return ok({ taskId });
  } catch (error) {
    return unexpected(error);
  }
}
