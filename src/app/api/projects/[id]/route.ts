import { getSession } from "@/lib/session";
import { linkOwnerProjectToGoal } from "@/lib/domain/commands";
import { getProject } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Point a project at a goal, or clear it with `goalId: null`. The project's
 * tasks follow it, which is what gives the goal a progress figure.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession();
    const { id } = await context.params;
    if (!getProject(session.company.id, id)) return fail("Project not found in this company.", 404);

    const body = await readJson<{ goalId?: string | null }>(request);
    if (body.goalId === undefined) return fail("Only the goal a project serves can be set here.");

    linkOwnerProjectToGoal({
      companyId: session.company.id,
      actorId: session.owner.id,
      projectId: id,
      goalId: body.goalId || null,
    });

    return ok({ projectId: id });
  } catch (error) {
    return unexpected(error);
  }
}
