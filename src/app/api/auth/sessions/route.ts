import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listMemberSessions, revokeSessionById, SESSION_COOKIE, sessionIdentityToken } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { endSessionUrl, getSsoConfig, originFromHeaders } from "@/lib/sso";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every browser signed in as this person. */
export async function GET() {
  try {
    const session = await getSession();
    return ok({
      sessions: listMemberSessions(session.owner.id),
      currentSessionId: session.sessionId,
    });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * Revoke one of them. The id is looked up inside this person's sessions, so one
 * owner cannot end a session belonging to somebody else even if they know its id.
 * Revoking the current browser also clears its cookie, and hands back the identity
 * provider's sign-out so the Cerulean session behind it ends too.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    const body = await readJson<{ id?: string }>(request);
    if (!body.id) return fail("Name the session to revoke.");

    const current = body.id === session.sessionId;
    const store = await cookies();
    const token = current ? store.get(SESSION_COOKIE)?.value : undefined;
    // Read before the row is deleted, otherwise the identity token is gone with it.
    const idToken = token ? sessionIdentityToken(token) : null;

    if (!revokeSessionById(session.owner.id, body.id)) {
      return fail("That session is not yours, or it has already ended.", 404);
    }

    const response = NextResponse.json({
      ok: true,
      revokedCurrent: current,
      logoutUrl: current
        ? await endSessionUrl(getSsoConfig(), idToken, originFromHeaders(request.headers))
        : null,
    });
    if (current && token) {
      response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    }
    return response;
  } catch (error) {
    return unexpected(error);
  }
}
