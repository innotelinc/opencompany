import { getSession } from "@/lib/session";
import { releaseComputer, takeOverComputer } from "@/lib/domain/commands";
import { getComputerForEmployee, getEmployee } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  try {
    const session = getSession();
    const { employeeId } = await context.params;
    const body = await readJson<{ action?: "takeover" | "release" }>(request);
    const employee = getEmployee(session.company.id, employeeId);
    if (!employee) return fail("Employee not found in this company.", 404);
    if (!getComputerForEmployee(session.company.id, employeeId)) return fail("Employee has no computer.", 404);

    if (body.action === "takeover") {
      takeOverComputer({ companyId: session.company.id, employeeId, actorId: session.owner.id });
      return ok();
    }
    if (body.action === "release") {
      releaseComputer({ companyId: session.company.id, employeeId, actorId: session.owner.id });
      return ok();
    }
    return fail("Unknown computer action.");
  } catch (error) {
    return unexpected(error);
  }
}
