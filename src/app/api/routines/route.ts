import { getSession } from "@/lib/session";
import { createRoutineForEmployee } from "@/lib/domain/commands";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{
      name?: string;
      instructions?: string;
      employeeId?: string;
      intervalMinutes?: number;
    }>(request);
    if (!body.name?.trim()) return fail("A routine name is required.");
    if (!body.instructions?.trim()) return fail("Routine instructions are required.");
    if (!body.employeeId) return fail("Choose an employee.");
    createRoutineForEmployee({
      companyId: session.company.id,
      actorId: session.owner.id,
      name: body.name,
      instructions: body.instructions,
      employeeId: body.employeeId,
      intervalMinutes: Number(body.intervalMinutes ?? 1440),
    });
    return ok();
  } catch (error) {
    return unexpected(error);
  }
}
