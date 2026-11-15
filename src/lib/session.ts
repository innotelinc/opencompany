import { cookies } from "next/headers";
import { resolveSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getCompany, getHumanMember } from "@/lib/domain/repo";
import type { Company, HumanMember } from "@/lib/domain/types";

/**
 * The owner session comes from a signed-in browser, never from a header or body.
 *
 * The cookie holds a random token; the database holds only its hash, and the
 * company and member are read from that row. A request without a live session
 * therefore reaches no data at all — every route and page fails closed by calling
 * this. Middleware turns the failure into a sign-in redirect for pages and a 401
 * for the API.
 */
export interface Session {
  company: Company;
  owner: HumanMember;
  sessionId: string;
  expiresAt: string;
}

export class UnauthorizedError extends Error {
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getSession(): Promise<Session> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new UnauthorizedError();

  const resolved = resolveSessionToken(token);
  if (!resolved) throw new UnauthorizedError("That session has expired. Sign in again.");

  const company = getCompany(resolved.companyId);
  const owner = getHumanMember(resolved.memberId);
  if (!company || !owner) throw new UnauthorizedError();

  return { company, owner, sessionId: resolved.id, expiresAt: resolved.expiresAt };
}

export async function tryGetSession(): Promise<Session | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}
