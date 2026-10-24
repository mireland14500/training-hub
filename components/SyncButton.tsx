"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Runner from "./Runner";

type Step = { state: "waiting" | "running" | "done" | "skipped" | "failed"; detail?: string };

const TIPS = [
  "Lacing up…",
  "Pulling last night's HRV…",
  "Counting your kilometres…",
  "Checking your sleep score…",
  "Matching Garmin load to your runs…",
  "Finding your best efforts…",
  "Reading Body Battery…",
];

async function post(url: string) {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  return { ok: res.ok, body };
}

export default function SyncButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [strava, setStrava] = useState<Step>({ state: "waiting" });
  const [garmin, setGarmin] = useState<Step>({ state: "waiting" });
  const [tip, setTip] = useState(0);

  useEffect(() => {
    if (!open || finished) return;
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 2200);
    return () => clearInterval(t);
  }, [open, finished]);

  async function sync() {
    setOpen(true);
    setFinished(false);
    setTip(0);
    setGarmin({ state: "waiting" });

    setStrava({ state: "running" });
    try {
      const { ok, body: r } = await post("/api/strava/sync");
      if (!ok && /not connected/i.test(r.error ?? "")) {
        setStrava({ state: "skipped", detail: "Not connected — connect it in Settings" });
      } else if (!ok) throw new Error(r.error);
      else setStrava({
        state: "done",
        detail:
          `${r.imported} checked, ${r.streamsProcessed} analysed` +
          (r.pendingStreams ? ` · ${r.pendingStreams} still to analyse${r.rateLimited ? " (Strava limit — try again in 15 min)" : " — sync again"}` : ""),
      });
    } catch (e) {
      setStrava({ state: "failed", detail: (e as Error).message });
    }

    setGarmin({ state: "running" });
    try {
      const { ok, body: r } = await post("/api/garmin/sync");
      if (r.notConnected) setGarmin({ state: "skipped", detail: r.error });
      else if (!ok) throw new Error(r.error);
      else setGarmin({ state: "done", detail: `${r.days} days of recovery · ${r.matched} of ${r.total} activities matched` });
    } catch (e) {
      setGarmin({ state: "failed", detail: (e as Error).message });
    }

    setFinished(true);
    router.refresh();
  }

  return (
    <>
      <button onClick={sync} disabled={open} className="btn-ghost text-sm">
        ↻ Sync
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Syncing your data">
          <div className="card w-full max-w-sm space-y-4 text-center">
            <Runner done={finished} />
            <div>
              <h2 className="text-xl font-extrabold">{finished ? "You're up to date" : "Fetching latest data"}</h2>
              <p className="mt-0.5 h-5 text-sm text-muted" aria-live="polite">
                {finished ? "Fresh numbers are on your dashboard." : TIPS[tip]}
              </p>
            </div>
            <ul className="space-y-2 text-left text-sm">
              <StepRow label="Strava" step={strava} />
              <StepRow label="Garmin" step={garmin} />
            </ul>
            {finished && (
              <button onClick={() => setOpen(false)} className="btn-primary w-full">
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StepRow({ label, step }: { label: string; step: Step }) {
  const icon = {
    waiting: <span className="text-muted">○</span>,
    running: <span className="sync-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent" />,
    done: <span className="font-bold text-good">✓</span>,
    skipped: <span className="font-bold text-muted">–</span>,
    failed: <span className="font-bold text-bad">✕</span>,
  }[step.state];
  return (
    <li className="flex gap-2.5 rounded-xl bg-bg px-3 py-2.5">
      <span className="flex w-4 shrink-0 justify-center pt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className="font-semibold">{label}</span>
        {step.state === "running" && <span className="text-muted"> · syncing…</span>}
        {step.detail && <span className="block text-xs text-muted">{step.detail}</span>}
      </span>
    </li>
  );
}
