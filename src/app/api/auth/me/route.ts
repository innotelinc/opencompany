import { getSession, tryGetSession } from "@/lib/session";
import { ok, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    return ok({
      owner: { id: session.owner.id, name: session.owner.name, email: session.owner.email },
      company: { id: session.company.id, name: session.company.name, slug: session.company.slug },
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return unexpected(error);
  }
}
