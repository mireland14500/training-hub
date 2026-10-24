"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { markSim, type SimChange } from "@/app/actions";
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

/** A gap: "4:53", or "1:02:10" past an hour. */
function gap(s: number) {
  return s >= 3600 ? clock(s) : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
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
  division,
  divisions,
}: {
  id: string;
  current: "full" | "half" | "none" | null;
  /** What the name alone would make it, if you haven't chosen. */
  autoKind: "full" | "half" | null;
  durationS: number;
  simTimeS: number | null;
  /** Category the sim currently counts for. */
  division: string;
  /** Categories to choose from, most likely first: [key, label]. */
  divisions: [string, string][];
}) {
  const router = useRouter();
  const effective = current ?? autoKind ?? "none";
  const [kind, setKind] = useState<Kind>(effective);
  const [time, setTime] = useState(fmtTime(simTimeS ?? durationS));
  const [category, setCategory] = useState(division);
  const [overlay, setOverlay] = useState<null | { changes: SimChange[]; error?: string; done: boolean }>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!overlay || overlay.done) return;
    const t = setInterval(() => setStep((i) => Math.min(i + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [overlay]);

  async function save() {
    setStep(0);
    setOverlay({ changes: [], done: false });
    const form = new FormData();
    form.set("id", id);
    form.set("kind", kind);
    form.set("sim_time", time);
    form.set("division", category);
    const started = Date.now();
    const r = await markSim(form).catch((e: Error) => ({ changes: [] as SimChange[], error: e.message }));
    // Let the animation breathe for a moment, even on a fast connection.
    await new Promise((res) => setTimeout(res, Math.max(0, 1800 - (Date.now() - started))));
    setOverlay({ ...r, done: true });
    router.refresh();
  }

  const divisionLabel = divisions.find(([k]) => k === division)?.[1] ?? division;
  const status =
    effective === "none"
      ? "Not counted as a sim."
      : `Counted as a ${effective} sim${current ? "" : " (from its name)"} · ${divisionLabel} · ${clock(simTimeS ?? durationS)}${effective === "full" ? ` · feeds your ${divisionLabel} prediction` : ""}`;
  const isSim = kind === "full" || kind === "half";
  const changed = kind !== effective || (isSim && (time !== fmtTime(simTimeS ?? durationS) || category !== division));

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
      {isSim && (
        <label className="block">
          <span className="text-xs text-muted">Category — a doubles sim only changes your doubles prediction</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1">
            {divisions.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {isSim && (
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
              <div className="space-y-3">
                <h2 className="text-xl font-extrabold">{overlay.changes.some((c) => c.before !== c.after) ? "Race prediction updated" : "Saved"}</h2>
                {overlay.changes.map((c) => {
                  const diff = c.before != null && c.after != null ? Math.round(c.after - c.before) : null;
                  return (
                    <div key={c.label} className="rounded-xl bg-bg p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{c.label}</div>
                      {c.after != null && (
                        <div className="tabular mt-0.5 flex items-baseline justify-center gap-3">
                          {c.before != null && diff !== 0 && <span className="text-base text-muted line-through">{clock(c.before)}</span>}
                          <span className="text-2xl font-extrabold">{clock(c.after)}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted">
                        {diff === null || diff === 0
                          ? kind === "full"
                            ? "No change: the station-by-station estimate is already faster than this sim."
                            : "No change."
                          : diff < 0
                            ? `${gap(-diff)} faster — your sim beats the station-by-station estimate.`
                            : `${gap(diff)} slower — this sim no longer counts here.`}
                      </p>
                    </div>
                  );
                })}
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
