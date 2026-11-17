import { NextResponse, type NextRequest } from "next/server";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getCompanyBySlug, getHumanMemberByEmail, listHumanMembers } from "@/lib/domain/repo";
import {
  decodeState,
  discover,
  exchangeCode,
  getSsoConfig,
  loadJwks,
  SSO_STATE_COOKIE,
  verifyIdToken,
} from "@/lib/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/signin?error=${reason}`, request.url));
}

/**
 * The return leg from Authentik: swap the one-time code for tokens, check the identity
 * token, and only then open a session — against the member this application already
 * knows. An identity that Authentik has but this console was not told about is
 * refused instead of being given an owner session.
 */
export async function GET(request: NextRequest) {
  const config = getSsoConfig();
  if (!config) return back(request, "not_configured");

  const stored = decodeState(request.cookies.get(SSO_STATE_COOKIE)?.value);
  if (!stored) return back(request, "expired");

  const { searchParams } = request.nextUrl;
  if (searchParams.get("error")) return back(request, "denied");

  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";
  if (!code || state !== stored.state) return back(request, "expired");

  try {
    const discovery = await discover(config);
    const tokens = await exchangeCode(config, discovery, code, stored.verifier);
    if (!tokens.id_token) return back(request, "provider");

    const claims = await verifyIdToken(tokens.id_token, {
      issuer: discovery.issuer,
      clientId: config.clientId,
      nonce: stored.nonce,
      jwks: await loadJwks(discovery.jwks_uri),
    });

    const email = (claims.email ?? "").trim().toLowerCase();
    if (!email) return back(request, "no_email");

    const company = getCompanyBySlug(getConfig().companySlug);
    if (!company) return back(request, "not_allowed");

    // The owner's address in this application, or an address the operator named in
    // OPENCO_SSO_ALLOWED_EMAILS for a single-owner company.
    let member = getHumanMemberByEmail(company.id, email);
    if (!member && config.allowedEmails.includes(email)) {
      const members = listHumanMembers(company.id);
      if (members.length === 1) member = members[0];
    }
    if (!member) {
      console.warn("[opencompany:sso] identity is not allowed to sign in");
      return back(request, "not_allowed");
    }

    const session = createSession({
      companyId: member.companyId,
      memberId: member.id,
      userAgent: request.headers.get("user-agent"),
    });

    const response = NextResponse.redirect(new URL(stored.next, config.publicUrl));
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.publicUrl.startsWith("https://"),
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    // The key material for this attempt has done its job.
    response.cookies.set(SSO_STATE_COOKIE, "", { path: "/api/auth/sso", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[opencompany:sso]", error);
    return back(request, "provider");
  }
}
