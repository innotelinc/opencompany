"use client";

import { useState } from "react";

export function SignInForm({ defaultEmail, nextPath }: { defaultEmail: string; nextPath: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next: nextPath }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; next?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? `Could not sign in (${response.status}).`);
        setBusy(false);
        return;
      }
      window.location.assign(payload.next ?? nextPath ?? "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="signin-email">Email</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="signin-password">Password</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
        />
      </div>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error ? (
        <p className="tiny" style={{ color: "var(--danger)", margin: 0 }} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      disabled={busy}
      style={{ marginTop: 6 }}
      onClick={async () => {
        setBusy(true);
        // The response names the identity provider's sign-out when there is one, so the
        // Cerulean session ends too instead of the next visit skipping the password.
        const response = await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
        const payload = response
          ? ((await response.json().catch(() => ({}))) as { logoutUrl?: string | null })
          : null;
        window.location.assign(payload?.logoutUrl ?? "/signin");
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
