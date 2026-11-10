import { getSession } from "@/lib/session";
import { createCompanyEmployee } from "@/lib/domain/commands";
import { listDepartments, listEmployees } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = getSession();
    return ok({
      employees: listEmployees(session.company.id),
      departments: listDepartments(session.company.id),
    });
  } catch (error) {
    return unexpected(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{
      name?: string;
      title?: string;
      roleInstructions?: string;
      departmentId?: string | null;
      managerId?: string | null;
      backend?: string;
      allowedTools?: string[];
      authority?: string;
      spendLimitCents?: number;
    }>(request);
    if (!body.name || !body.title) return fail("Name and title are required.");
    if (body.backend && !["deterministic", "llm"].includes(body.backend)) {
      return fail("Backend must be deterministic or llm.");
    }
    const result = createCompanyEmployee({
      companyId: session.company.id,
      actorId: session.owner.id,
      name: body.name,
      title: body.title,
      roleInstructions: body.roleInstructions ?? "",
      departmentId: body.departmentId ?? null,
      managerId: body.managerId ?? null,
      backend: body.backend ?? "deterministic",
      allowedTools: body.allowedTools ?? ["files.read", "files.write", "knowledge.read"],
      authority: body.authority ?? "internal",
      spendLimitCents: Math.max(0, Math.min(10_000, body.spendLimitCents ?? 50)),
    });
    return ok(result);
  } catch (error) {
    return unexpected(error);
  }
}
