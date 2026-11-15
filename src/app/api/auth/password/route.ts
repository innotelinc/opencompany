import { getSession } from "@/lib/session";
import {
  clearAuthFailures,
  hashPassword,
  passwordProblem,
  recordAuthFailure,
  recentAuthFailures,
  revokeOtherSessions,
  SIGNIN_MAX_FAILURES,
  verifyPassword,
} from "@/lib/auth";
import { getPasswordHash, recordActivity, setPasswordHash } from "@/lib/domain/repo";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Change the signed-in owner's password.
 *
 * The current password is required, so a borrowed browser cannot be used to lock
 * the real owner out. Other sessions are revoked on success — this one stays, so
 * the change does not sign the owner out of the browser they just typed it in.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (!currentPassword || !newPassword) return fail("Enter your current password and the new one.");

    const key = `password|${session.owner.id}`;
    if (recentAuthFailures(key) >= SIGNIN_MAX_FAILURES) {
      return fail("Too many wrong attempts. Wait fifteen minutes and try again.", 429);
    }

    if (!verifyPassword(currentPassword, getPasswordHash(session.owner.id))) {
      recordAuthFailure(key);
      return fail("That is not your current password.", 401);
    }

    const problem = passwordProblem(newPassword);
    if (problem) return fail(problem);
    if (newPassword === currentPassword) return fail("The new password is the same as the old one.");

    if (!setPasswordHash(session.owner.id, hashPassword(newPassword))) {
      return fail("Could not save the password.", 500);
    }
    clearAuthFailures(key);
    const revoked = revokeOtherSessions(session.owner.id, session.sessionId);

    recordActivity({
      companyId: session.company.id,
      actorType: "human",
      actorId: session.owner.id,
      type: "auth.password_changed",
      summary: `Owner changed their password; ${revoked} other session(s) signed out.`,
      payload: { revokedSessions: revoked },
    });

    return ok({ revokedSessions: revoked });
  } catch (error) {
    return unexpected(error);
  }
}
