"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function KnowledgeEditor({ docId, initialBody }: { docId: string; initialBody: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn small" type="button" onClick={() => setOpen(true)}>
        Edit document
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
      <div className="row">
        <button
          className="btn primary small"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const response = await fetch("/api/knowledge", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "edit", id: docId, body }),
            });
            const payload = await response.json().catch(() => ({}));
            setBusy(false);
            if (!response.ok) {
              setError(payload.error ?? "Could not save.");
              return;
            }
            setOpen(false);
            router.refresh();
          }}
        >
          {busy ? "Saving…" : "Save new version"}
        </button>
        <button className="btn ghost small" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
