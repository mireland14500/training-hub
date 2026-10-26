"use client";

import { useEffect, useMemo, useState } from "react";
import { racePlan } from "@/lib/fuel";

const LOADS = [6, 7, 8, 9, 10];

/** Carb load + race-morning plan, scaled to your weight, with a tick-list remembered on this device. */
export default function CarbPlanner({ raceId, raceDate, startTime, weight: initialWeight, today }: { raceId: string; raceDate: string; startTime: string | null; weight: number | null; today: string }) {
  const [weight, setWeight] = useState(initialWeight ? String(initialWeight) : "");
  const [load, setLoad] = useState(8);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const key = `fuel:${raceId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (saved.done) setDone(saved.done);
      if (LOADS.includes(saved.load)) setLoad(saved.load);
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ done, load }));
    } catch {}
  }, [key, done, load]);

  const kg = Number(weight);
  const plan = useMemo(() => (kg >= 35 && kg <= 200 ? racePlan(kg, load, startTime, null) : null), [kg, load, startTime]);
  const offset = (Date.parse(raceDate) - Date.parse(today)) / 86400_000;
  const current = offset === 2 ? "d2" : offset === 1 ? "d1" : offset === 0 ? "bf" : null;
  const toggle = (id: string) => setDone((d) => ({ ...d, [id]: !d[id] }));

  return (
    <div className="space-y-3.5">
      <section className="card space-y-3">
        <div className="label">Your numbers</div>
        <div className="grid grid-cols-[7rem_1fr] items-end gap-3">
          <label className="block">
            <span className="text-xs text-muted">Weight (kg)</span>
            <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.1" inputMode="decimal" className="input mt-1" />
          </label>
          <div>
            <span className="text-xs text-muted">Day-before load (g per kg)</span>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {LOADS.map((l) => (
                <button key={l} type="button" onClick={() => setLoad(l)} aria-pressed={load === l} className={`rounded-lg border py-2 text-sm font-bold ${load === l ? "border-accent bg-accent/10 text-accent" : "border-border"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted">
          8 g/kg suits most HYROX athletes. Go 6–7 if big volumes upset your stomach; 9–10 only if you've practised it. Full 10–12 g/kg loads are for races over 90 minutes.
        </p>
      </section>

      {plan?.map((step) => (
        <section key={step.key} className={`card space-y-2 ${current === step.key ? "border-accent" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {step.when}
                {current === step.key && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-bg">TODAY</span>}
              </div>
              <h3 className="font-bold leading-snug">{step.title}</h3>
            </div>
            {step.carbs !== null && (
              <div className="tabular shrink-0 text-right">
                <div className="text-xl font-extrabold">{step.carbs} g</div>
                <div className="text-[11px] text-muted">carbs</div>
              </div>
            )}
          </div>

          {step.meals && (
            <ul className="divide-y divide-border rounded-xl bg-bg">
              {step.meals.map((m, i) => {
                const id = `${step.key}-${i}`;
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                      <input type="checkbox" checked={!!done[id]} onChange={() => toggle(id)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className={`flex justify-between gap-2 text-sm font-semibold ${done[id] ? "text-muted line-through" : ""}`}>
                          <span>{m.name}</span>
                          <span className="tabular">{m.total} g</span>
                        </span>
                        <span className="block text-xs text-muted">{m.foods.map((f) => `${f.count > 1 ? `${f.count} × ` : ""}${f.food.name} (${f.food.portion})`).join(" · ")}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              <li className="flex justify-between px-3 py-2 text-xs text-muted">
                <span>{step.meals.filter((_, i) => done[`${step.key}-${i}`]).length} of {step.meals.length} done</span>
                <span className="tabular">
                  {step.meals.filter((_, i) => done[`${step.key}-${i}`]).reduce((a, m) => a + m.total, 0)} / {step.carbs} g
                </span>
              </li>
            </ul>
          )}

          <ul className="space-y-1 text-sm text-muted">
            {step.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
          {!step.meals && step.key !== "d2" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={!!done[step.key]} onChange={() => toggle(step.key)} className="h-4 w-4 accent-[var(--accent)]" />
              <span className={done[step.key] ? "text-muted line-through" : ""}>Done</span>
            </label>
          )}
        </section>
      ))}
      {!plan && <p className="card text-sm text-muted">Enter your weight to get your numbers.</p>}
      <p className="text-xs text-muted">General sports-nutrition guidance, not medical advice. Try the day-before and breakfast plan before a hard session or sim first, so race day holds no surprises.</p>
    </div>
  );
}
