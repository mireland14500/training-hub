"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

/** A runner on a track with a heartbeat pulse above — pure SVG + CSS. */
function Runner({ done }: { done: boolean }) {
  const ecg = "4,26 78,26 88,26 96,8 106,46 114,18 120,26 236,26";
  return (
    <svg viewBox="0 0 240 150" className={`sync-runner mx-auto h-auto w-56 ${done ? "is-done" : ""}`} role="img" aria-label="Animated runner">
      <polyline points={ecg} fill="none" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round" />
      <polyline className="sync-ecg" points={ecg} pathLength={100} fill="none" stroke="var(--bad)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <line x1="10" y1="136" x2="230" y2="136" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
      <line className="sync-dash" x1="-40" y1="144" x2="280" y2="144" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 24" />
      <g className="sync-wind" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
        <line x1="62" y1="70" x2="84" y2="70" />
        <line x1="52" y1="86" x2="80" y2="86" />
        <line x1="66" y1="102" x2="84" y2="102" />
      </g>
      <g className="sync-body" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* far-side limbs first, lighter */}
        <g className="sync-limb sync-b" style={{ transformOrigin: "120px 98px" }} opacity="0.5">
          <polyline points="120,98 132,114 126,132" />
        </g>
        <g className="sync-limb sync-a" style={{ transformOrigin: "128px 66px" }} opacity="0.5">
          <polyline points="128,66 140,80 152,72" />
        </g>
        <line x1="129" y1="64" x2="120" y2="98" />
        <circle cx="134" cy="48" r="10" fill="var(--accent)" stroke="none" />
        <g className="sync-limb sync-a" style={{ transformOrigin: "120px 98px" }}>
          <polyline points="120,98 132,114 126,132" />
        </g>
        <g className="sync-limb sync-b" style={{ transformOrigin: "128px 66px" }}>
          <polyline points="128,66 140,80 152,72" />
        </g>
      </g>
    </svg>
  );
}
