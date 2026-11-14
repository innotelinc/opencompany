import { getSession } from "@/lib/session";
import { createOwnerGoal } from "@/lib/domain/commands";
import { listGoals } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = getSession();
    return ok({ goals: listGoals(session.company.id) });
  } catch (error) {
    return unexpected(error);
  }
}

/** The owner writes a goal by hand, outside anything the CEO proposed. */
export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{ title?: string; description?: string; budgetCents?: number }>(request);
    if (!body.title?.trim()) return fail("A goal needs a title.");

    const goalId = createOwnerGoal({
      companyId: session.company.id,
      actorId: session.owner.id,
      title: body.title,
      description: body.description,
      budgetCents: typeof body.budgetCents === "number" ? body.budgetCents : 0,
    });

    return ok({ goalId });
  } catch (error) {
    return unexpected(error);
  }
}
