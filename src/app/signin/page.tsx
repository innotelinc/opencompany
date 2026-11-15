import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — OPENco.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const email = getConfig().ownerEmail;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
      <section className="panel" style={{ width: "100%", maxWidth: 380 }}>
        <div className="panel-head">
          <h2>Sign in</h2>
          <span className="hint">Owner only</span>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          This console acts as the owner of the company. It needs the password set for{" "}
          <span className="mono tiny">{email}</span>.
        </p>
        <SignInForm defaultEmail={email} nextPath={next ?? "/"} />
        <p className="tiny faint" style={{ marginTop: 14, marginBottom: 0 }}>
          Set or reset the password on the server with <span className="mono">npm run auth:password -- {email}</span>.
          Sessions last 30 days and can be ended from the sidebar.
        </p>
      </section>
    </div>
  );
}
