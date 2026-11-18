import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { getSsoConfig, passwordSigninAllowed } from "@/lib/sso";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — OPENco.",
};

/** What each failure on the way back from the identity provider means to a person. */
const SSO_ERRORS: Record<string, string> = {
  expired: "That sign-in took too long or was already used. Try again.",
  denied: "The sign-in was cancelled.",
  not_allowed: "That identity is not allowed to open this console. Ask the owner to add your address.",
  no_email: "The identity provider did not return an email address for that account.",
  provider: "The identity provider could not complete the sign-in. Try again.",
  not_configured: "Single sign-on is not configured on this deployment.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const sso = getSsoConfig();
  const email = getConfig().ownerEmail;
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const message = error ? (SSO_ERRORS[error] ?? "The sign-in did not complete. Try again.") : null;
  // Closed by default: only an operator who set OPENCO_PASSWORD_SIGNIN=1 for an outage
  // sees the password form beside the Cerulean button.
  const breakGlass = Boolean(sso) && passwordSigninAllowed();

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
      <section className="panel" style={{ width: "100%", maxWidth: 380 }}>
        <div className="panel-head">
          <h2>Sign in</h2>
          <span className="hint">Owner only</span>
        </div>
        {sso ? (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              This console acts as the owner of the company and signs you in with your Cerulean
              identity. Your password is never entered here.
            </p>
            <a
              className="btn primary"
              href={`/api/auth/sso/start?next=${encodeURIComponent(nextPath)}`}
              style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
            >
              Sign in with Cerulean
            </a>
            {message ? (
              <p className="tiny" style={{ color: "var(--danger)", margin: "12px 0 0" }} role="alert">
                {message}
              </p>
            ) : null}
            {breakGlass ? (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <p className="tiny" style={{ color: "var(--danger)", margin: "0 0 10px" }}>
                  Emergency password sign-in is open (<span className="mono">OPENCO_PASSWORD_SIGNIN=1</span>).
                  Use it only while Cerulean is unavailable, then remove that variable.
                </p>
                <SignInForm defaultEmail={email} nextPath={nextPath} />
              </div>
            ) : null}
            <p className="tiny faint" style={{ marginTop: 14, marginBottom: 0 }}>
              Sessions last 30 days and can be ended from the sidebar; signing out also ends your
              Cerulean session. Accounts are managed in Authentik at{" "}
              <span className="mono">auth.cerulean.innotel.us</span>.
            </p>
          </>
        ) : (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              This console acts as the owner of the company. It needs the password set for{" "}
              <span className="mono tiny">{email}</span>.
            </p>
            <SignInForm defaultEmail={email} nextPath={nextPath} />
            <p className="tiny faint" style={{ marginTop: 14, marginBottom: 0 }}>
              Set or reset the password on the server with <span className="mono">npm run auth:password -- {email}</span>.
              Sessions last 30 days and can be ended from the sidebar.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
