import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeUrl,
  discover,
  encodeState,
  getSsoConfig,
  newState,
  originFromHeaders,
  SSO_STATE_COOKIE,
  SSO_STATE_TTL_SECONDS,
} from "@/lib/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begin a sign-in: keep the state, nonce and PKCE verifier in a short-lived cookie,
 * then hand the browser to Authentik. Nothing secret travels in the URL.
 */
export async function GET(request: NextRequest) {
  const config = getSsoConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/signin?error=not_configured", request.url));
  }

  // The browser must come back to the name it used — the deployment has more than one
  // public name, and a fixed one sends the session cookie to the other origin. Only a
  // request that did not arrive through the proxy falls back to the configured URL.
  const origin = originFromHeaders(request.headers) ?? config.publicUrl;

  const state = newState(request.nextUrl.searchParams.get("next"));
  try {
    const discovery = await discover(config);
    const response = NextResponse.redirect(authorizeUrl(config, discovery, state, origin));
    response.cookies.set(SSO_STATE_COOKIE, encodeState(state), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
      path: "/api/auth/sso",
      maxAge: SSO_STATE_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[opencompany:sso]", error);
    return NextResponse.redirect(new URL("/signin?error=provider", origin));
  }
}
