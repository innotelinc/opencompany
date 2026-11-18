import { NextResponse } from "next/server";
import {
  clearAuthFailures,
  createSession,
  hashPassword,
  recordAuthFailure,
  recentAuthFailures,
  SIGNIN_MAX_FAILURES,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifyPassword,
} from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getCompanyBySlug, getHumanMemberByEmail, getPasswordHash } from "@/lib/domain/repo";
import { getSsoConfig, passwordSigninAllowed } from "@/lib/sso";
import { fail, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A hash of a throwaway password, compared when the email is unknown so that a
 * missing account takes as long to answer as a wrong password does.
 */
const DUMMY_HASH = hashPassword("this-is-not-anyones-password");

function attemptKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "local";
  return `${ip}|${email.toLowerCase()}`;
}

export async function POST(request: Request) {
  try {
    // Once single sign-on is configured this route is not a second way in: the
    // console's own password no longer authenticates anyone. The one exception is an
    // operator deliberately reopening it while Authentik is unavailable.
    if (getSsoConfig() && !passwordSigninAllowed()) {
      return fail("This console signs in through Cerulean single sign-on.", 403);
    }

    const body = await readJson<{ email?: string; password?: string; next?: string }>(request);
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    if (!email || !password) return fail("Enter your email and password.");

    const key = attemptKey(request, email);
    if (recentAuthFailures(key) >= SIGNIN_MAX_FAILURES) {
      return fail("Too many failed attempts. Wait fifteen minutes and try again.", 429);
    }

    const company = getCompanyBySlug(getConfig().companySlug);
    const member = company ? getHumanMemberByEmail(company.id, email) : null;
    const stored = member ? getPasswordHash(member.id) : null;

    const passwordOk = verifyPassword(password, stored ?? DUMMY_HASH);
    if (!member || !stored || !passwordOk) {
      recordAuthFailure(key);
      // One message for both cases: which half was wrong is not the caller's business.
      return fail("That email and password do not match.", 401);
    }

    clearAuthFailures(key);
    const session = createSession({
      companyId: member.companyId,
      memberId: member.id,
      userAgent: request.headers.get("user-agent"),
    });

    const secure = request.headers.get("x-forwarded-proto") === "https";
    const nextPath = body.next && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : "/";
    const response = NextResponse.json({ ok: true, next: nextPath, expiresAt: session.expiresAt });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    return unexpected(error);
  }
}
