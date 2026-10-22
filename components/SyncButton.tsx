"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      setMsg(
        `${r.imported} activities checked, ${r.streamsProcessed} analysed` +
          (r.pendingStreams ? ` · ${r.pendingStreams} still to analyse${r.rateLimited ? " (Strava limit — try again in 15 min)" : " — tap again"}` : ""),
      );
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={sync} disabled={busy} className="btn-ghost text-sm">
        {busy ? "Syncing…" : "Sync Strava"}
      </button>
      {msg && <p className="max-w-xs text-right text-xs text-muted">{msg}</p>}
    </div>
  );
}
