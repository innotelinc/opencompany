import { getSession } from "@/lib/session";
import { haltCompany, resumeCompany } from "@/lib/domain/commands";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{ action?: "halt" | "resume"; reason?: string }>(request);
    if (body.action === "halt") {
      const result = haltCompany({
        companyId: session.company.id,
        actorId: session.owner.id,
        reason: body.reason ?? "Emergency stop requested by the owner.",
      });
      return ok(result);
    }
    if (body.action === "resume") {
      resumeCompany({ companyId: session.company.id, actorId: session.owner.id });
      return ok();
    }
    return fail("Unknown company action.");
  } catch (error) {
    return unexpected(error);
  }
}
