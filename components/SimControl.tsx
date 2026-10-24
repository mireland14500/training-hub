"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { markSim } from "@/app/actions";
import Runner from "./Runner";
import { fmtTime } from "./photo";

type Kind = "full" | "half" | "none" | "auto";

const OPTIONS: { kind: Kind; label: string }[] = [
  { kind: "full", label: "Full sim" },
  { kind: "half", label: "Half sim" },
  { kind: "none", label: "Not a sim" },
];

const STEPS = ["Reading your sim…", "Re-checking every station…", "Updating race predictions…"];

function clock(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * "Was this a HYROX sim?" on a session. Saving shows an "Updating race predictions"
 * screen, then the prediction before and after.
 */
export default function SimControl({
  id,
  current,
  autoKind,
  durationS,
  simTimeS,
}: {
  id: string;
  current: "full" | "half" | "none" | null;
  /** What the name alone would make it, if you haven't chosen. */
  autoKind: "full" | "half" | null;
  durationS: number;
  simTimeS: number | null;
}) {
  const router = useRouter();
  const effective = current ?? autoKind ?? "none";
  const [kind, setKind] = useState<Kind>(effective);
  const [time, setTime] = useState(fmtTime(simTimeS ?? durationS));
  const [overlay, setOverlay] = useState<null | { before: number | null; after: number | null; error?: string; done: boolean }>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!overlay || overlay.done) return;
    const t = setInterval(() => setStep((i) => Math.min(i + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [overlay]);

  async function save() {
    setStep(0);
    setOverlay({ before: null, after: null, done: false });
    const form = new FormData();
    form.set("id", id);
    form.set("kind", kind);
    form.set("sim_time", time);
    const started = Date.now();
    const r = await markSim(form).catch((e: Error) => ({ before: null, after: null, error: e.message }));
    // Let the animation breathe for a moment, even on a fast connection.
    await new Promise((res) => setTimeout(res, Math.max(0, 1800 - (Date.now() - started))));
    setOverlay({ ...r, done: true });
    router.refresh();
  }

  const status =
    effective === "none"
      ? "Not counted as a sim."
      : `Counted as a ${effective} sim${current ? "" : " (from its name)"} · ${clock(simTimeS ?? durationS)}${effective === "full" ? " · feeds your race prediction" : ""}`;
  const changed = kind !== effective || (kind !== "none" && time !== fmtTime(simTimeS ?? durationS));
  const diff = overlay?.before != null && overlay.after != null ? Math.round(overlay.after - overlay.before) : null;

  return (
    <div className="card space-y-3">
      <div>
        <div className="label">HYROX sim</div>
        <p className="mt-0.5 text-sm text-muted">{status}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            onClick={() => setKind(o.kind)}
            className={`rounded-xl border px-2 py-2 text-sm font-semibold ${kind === o.kind ? "border-accent bg-accent/10 text-accent" : "border-border"}`}
            aria-pressed={kind === o.kind}
          >
            {o.label}
          </button>
        ))}
      </div>
      {(kind === "full" || kind === "half") && (
        <label className="block">
          <span className="text-xs text-muted">Sim finish time (leave out any warm-up)</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} inputMode="numeric" placeholder="1:05:30" className="input tabular mt-1" />
        </label>
      )}
      <button type="button" onClick={save} disabled={!changed} className="btn-primary w-full disabled:opacity-50">
        {kind === "full" ? "Save & update prediction" : "Save"}
      </button>

      {overlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Updating race predictions">
          <div className="card w-full max-w-sm space-y-4 text-center">
            <Runner done={overlay.done} />
            {!overlay.done ? (
              <div>
                <h2 className="text-xl font-extrabold">Updating race predictions</h2>
                <p className="mt-0.5 h-5 text-sm text-muted" aria-live="polite">{STEPS[step]}</p>
              </div>
            ) : overlay.error ? (
              <div>
                <h2 className="text-xl font-extrabold">Couldn&apos;t save</h2>
                <p className="mt-1 text-sm text-bad">{overlay.error}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold">Race prediction updated</h2>
                {overlay.after != null && (
                  <div className="flex items-baseline justify-center gap-3 tabular">
                    {overlay.before != null && diff !== 0 && <span className="text-lg text-muted line-through">{clock(overlay.before)}</span>}
                    <span className="text-3xl font-extrabold">{clock(overlay.after)}</span>
                  </div>
                )}
                <p className="text-sm text-muted">
                  {diff === null
                    ? "Saved."
                    : diff < 0
                      ? `${clock(-diff).replace(/^0:/, "")} faster — your sim beats the station-by-station estimate.`
                      : diff > 0
                        ? `${clock(diff).replace(/^0:/, "")} slower without this sim.`
                        : kind === "full"
                          ? "No change: the station-by-station estimate is already faster than this sim."
                          : "No change to your full-race prediction."}
                </p>
              </div>
            )}
            {overlay.done && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setOverlay(null)} className="btn-ghost">Close</button>
                <Link href="/hyrox" className="btn-primary">See HYROX</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
