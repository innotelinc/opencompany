import { getSession } from "@/lib/session";
import { deleteOwnerGoal, updateOwnerGoal } from "@/lib/domain/commands";
import { getGoal } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession();
    const { id } = await context.params;
    if (!getGoal(session.company.id, id)) return fail("Goal not found in this company.", 404);

    const body = await readJson<{
      title?: string;
      description?: string;
      budgetCents?: number;
      status?: string;
    }>(request);

    updateOwnerGoal({
      companyId: session.company.id,
      actorId: session.owner.id,
      goalId: id,
      title: body.title,
      description: body.description,
      budgetCents: typeof body.budgetCents === "number" ? body.budgetCents : undefined,
      status: body.status,
    });

    return ok({ goalId: id });
  } catch (error) {
    return unexpected(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession();
    const { id } = await context.params;
    if (!getGoal(session.company.id, id)) return fail("Goal not found in this company.", 404);
    deleteOwnerGoal({ companyId: session.company.id, actorId: session.owner.id, goalId: id });
    return ok({ goalId: id });
  } catch (error) {
    return unexpected(error);
  }
}
