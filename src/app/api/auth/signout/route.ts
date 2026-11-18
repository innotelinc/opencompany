import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE, sessionIdentityToken } from "@/lib/auth";
import { endSessionUrl, getSsoConfig, originFromHeaders } from "@/lib/sso";
import { unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * End this browser's session here and, when it signed in through Cerulean, at the
 * identity provider too: the token that opened the session is handed back in a
 * redirect to Authentik's end-session endpoint. Clearing only the local cookie would
 * leave the provider signed in and the next sign-in would skip the password.
 */
async function signOut(request: Request): Promise<{ logoutUrl: string | null }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { logoutUrl: null };
  const idToken = sessionIdentityToken(token);
  revokeSession(token);
  // Back to the name the browser used, so the post-logout page matches the cookie domain.
  const origin = getSsoConfig() ? originFromHeaders(request.headers) : null;
  return { logoutUrl: await endSessionUrl(getSsoConfig(), idToken, origin) };
}

function forgetSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export async function POST(request: Request) {
  try {
    const { logoutUrl } = await signOut(request);
    return forgetSession(NextResponse.json({ ok: true, logoutUrl }));
  } catch (error) {
    return unexpected(error);
  }
}

/** Signing out is safe to repeat, so a plain GET ends the session and follows along. */
export async function GET(request: Request) {
  try {
    const { logoutUrl } = await signOut(request);
    const target = logoutUrl ?? `${getSsoConfig()?.publicUrl ?? new URL(request.url).origin}/signin`;
    return forgetSession(NextResponse.redirect(target));
  } catch (error) {
    return unexpected(error);
  }
}
