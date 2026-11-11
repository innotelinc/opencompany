import { getSession } from "@/lib/session";
import { haltCompany, resumeCompany } from "@/lib/domain/commands";
import {
  createDepartment,
  renameDepartment,
  resetPositions,
  savePosition,
  updateCompanyIdentity,
  updateWorkTitle,
} from "@/lib/domain/setup";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{
      action?:
        | "halt"
        | "resume"
        | "update"
        | "department.create"
        | "department.rename"
        | "position.save"
        | "position.reset"
        | "employee.title";
      reason?: string;
      name?: string;
      mission?: string;
      operatingPrinciples?: string;
      departmentId?: string;
      charter?: string;
      key?: string;
      alias?: string;
      employeeId?: string;
      title?: string;
    }>(request);
    const companyId = session.company.id;
    const ownerId = session.owner.id;

    if (body.action === "halt") {
      const result = haltCompany({
        companyId,
        actorId: ownerId,
        reason: body.reason ?? "Emergency stop requested by the owner.",
      });
      return ok(result);
    }
    if (body.action === "resume") {
      resumeCompany({ companyId, actorId: ownerId });
      return ok();
    }

    if (body.action === "update") {
      const result = updateCompanyIdentity({
        companyId,
        ownerId,
        name: body.name,
        mission: body.mission,
        operatingPrinciples: body.operatingPrinciples,
      });
      if (!result.ok) return fail(result.reason ?? "Could not update the company profile.");
      return ok();
    }

    if (body.action === "department.create") {
      if (!body.name?.trim()) return fail("A department name is required.");
      const result = createDepartment({ companyId, ownerId, name: body.name, charter: body.charter });
      if (!result.ok) return fail(result.reason ?? "Could not create the department.");
      return ok({ id: result.id });
    }

    if (body.action === "department.rename") {
      if (!body.departmentId) return fail("Department id is required.");
      if (!body.name?.trim()) return fail("A department name is required.");
      const result = renameDepartment({ companyId, ownerId, departmentId: body.departmentId, name: body.name });
      if (!result.ok) return fail(result.reason ?? "Could not rename the department.");
      return ok();
    }

    if (body.action === "position.save") {
      if (!body.key) return fail("Position key is required.");
      const result = savePosition({
        companyId,
        ownerId,
        key: body.key,
        name: body.name ?? "",
        alias: body.alias ?? "",
      });
      if (!result.ok) return fail(result.reason ?? "Could not save the position.");
      return ok();
    }

    if (body.action === "position.reset") {
      resetPositions(companyId, ownerId);
      return ok();
    }

    if (body.action === "employee.title") {
      if (!body.employeeId) return fail("Employee id is required.");
      const result = updateWorkTitle({ companyId, ownerId, employeeId: body.employeeId, title: body.title ?? "" });
      if (!result.ok) return fail(result.reason ?? "Could not update the work title.");
      return ok();
    }

    return fail("Unknown company action.");
  } catch (error) {
    return unexpected(error);
  }
}
