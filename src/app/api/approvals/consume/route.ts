import { NextResponse } from "next/server";
import { approveDecision } from "@/lib/domain/decisions";
import { approvalLinkByToken, consumeApprovalLink, decisionForLink } from "@/lib/domain/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only place an emailed link becomes an approval. It is a POST from the
 * landing page, not the link itself, so a scanner that opens every URL in a
 * message cannot approve the work it was sent about.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const link = approvalLinkByToken(token);
  if (!link) {
    return NextResponse.redirect(new URL("/approvals/invalid", request.url), 303);
  }
  if (link.usedAt) {
    return NextResponse.redirect(new URL(`/approvals/${encodeURIComponent(token)}`, request.url), 303);
  }
  const decision = decisionForLink(link);
  if (!decision) {
    return NextResponse.redirect(new URL("/approvals/invalid", request.url), 303);
  }

  // Spend the link first: two clicks on one message must not produce two approvals.
  const spent = consumeApprovalLink(token);
  if (!spent) {
    return NextResponse.redirect(new URL(`/approvals/${encodeURIComponent(token)}`, request.url), 303);
  }

  const result = approveDecision({
    companyId: link.companyId,
    decisionId: link.decisionId,
    actor: { type: "human", id: link.humanMemberId },
    note: "Approved from the owner's email link.",
    submittedAction: decision.action,
  });
  const target = result.ok ? "/approvals/done" : `/approvals/${encodeURIComponent(token)}`;
  return NextResponse.redirect(new URL(target, request.url), 303);
}
