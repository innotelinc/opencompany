import { getSession } from "@/lib/session";
import {
  getStandingApproval,
  grantStandingApproval,
  revokeStandingApproval,
} from "@/lib/domain/autonomy";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = getSession();
    return ok({ approval: getStandingApproval(session.company.id) });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * Only the owner sets a standing approval, and only the owner can take it back.
 * The grant is stored as company policy so it survives restarts and applies to
 * decisions the worker proposes later.
 */
export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<{
      action?: "grant" | "revoke";
      kinds?: string[];
      note?: string;
    }>(request);

    if (body.action === "revoke") {
      const result = revokeStandingApproval({ companyId: session.company.id, ownerId: session.owner.id });
      return ok({ approval: result.approval });
    }

    if (body.action === "grant") {
      if (!Array.isArray(body.kinds)) return fail("Choose which decisions the owner is pre-approving.");
      const result = grantStandingApproval({
        companyId: session.company.id,
        ownerId: session.owner.id,
        kinds: body.kinds,
        note: body.note,
      });
      if (!result.ok) return fail(result.reason ?? "Could not record the standing approval.");
      return ok({ approval: result.approval });
    }

    return fail("Unknown autonomy action.");
  } catch (error) {
    return unexpected(error);
  }
}
