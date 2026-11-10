import { getSession } from "@/lib/session";
import { addKnowledge, editKnowledge } from "@/lib/domain/commands";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{
      action?: "create" | "edit";
      id?: string;
      title?: string;
      body?: string;
      accessScope?: "company" | "department" | "private";
      departmentId?: string | null;
      ownerEmployeeId?: string | null;
    }>(request);

    if (body.action === "edit") {
      if (!body.id) return fail("Document id is required.");
      if (typeof body.body !== "string") return fail("Document body is required.");
      editKnowledge({
        companyId: session.company.id,
        actorId: session.owner.id,
        docId: body.id,
        body: body.body,
      });
      return ok();
    }

    if (!body.title?.trim()) return fail("A title is required.");
    const id = addKnowledge({
      companyId: session.company.id,
      actorId: session.owner.id,
      title: body.title,
      body: body.body ?? "",
      accessScope: body.accessScope ?? "company",
      departmentId: body.departmentId ?? null,
      ownerEmployeeId: body.ownerEmployeeId ?? null,
    });
    return ok({ id });
  } catch (error) {
    return unexpected(error);
  }
}
