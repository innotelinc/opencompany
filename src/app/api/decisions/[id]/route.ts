import { getSession } from "@/lib/session";
import {
  approveDecision,
  rejectDecision,
  requestDecisionRevision,
} from "@/lib/domain/decisions";
import { getDecision } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession();
    const { id } = await context.params;
    const body = await readJson<{
      action?: "approve" | "reject" | "revise";
      note?: string;
      /** Optional: the details the owner saw. Mismatch invalidates the approval. */
      actionDetails?: Record<string, unknown>;
    }>(request);
    const decision = getDecision(session.company.id, id);
    if (!decision) return fail("Decision not found in this company.", 404);

    const actor = { type: "human" as const, id: session.owner.id };
    if (body.action === "approve") {
      const result = approveDecision({
        companyId: session.company.id,
        decisionId: id,
        actor,
        note: body.note,
        submittedAction: body.actionDetails,
      });
      if (!result.ok) return fail(result.reason ?? "Approval failed.", 409);
      return ok({ decision: result.decision });
    }
    if (body.action === "reject") {
      const result = rejectDecision({ companyId: session.company.id, decisionId: id, actor, note: body.note });
      if (!result.ok) return fail(result.reason ?? "Rejection failed.", 409);
      return ok({ decision: result.decision });
    }
    if (body.action === "revise") {
      if (!body.note?.trim()) return fail("Explain what should change before asking for a revision.");
      const result = requestDecisionRevision({
        companyId: session.company.id,
        decisionId: id,
        actor,
        note: body.note,
      });
      if (!result.ok) return fail(result.reason ?? "Revision request failed.", 409);
      return ok({ decision: result.decision });
    }
    return fail("Unknown decision action.");
  } catch (error) {
    return unexpected(error);
  }
}
