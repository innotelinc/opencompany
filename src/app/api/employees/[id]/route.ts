import { getSession } from "@/lib/session";
import { pauseEmployee } from "@/lib/domain/commands";
import { getEmployee } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession();
    const { id } = await context.params;
    const body = await readJson<{ action?: "pause" | "resume" }>(request);
    const employee = getEmployee(session.company.id, id);
    if (!employee) return fail("Employee not found in this company.", 404);
    if (body.action !== "pause" && body.action !== "resume") return fail("Unknown employee action.");
    pauseEmployee({
      companyId: session.company.id,
      employeeId: id,
      actorId: session.owner.id,
      paused: body.action === "pause",
    });
    return ok();
  } catch (error) {
    return unexpected(error);
  }
}
