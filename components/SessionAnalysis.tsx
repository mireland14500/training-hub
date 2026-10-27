import { formatDuration, formatPace, HR_ZONE_NAMES } from "@/lib/analysis";
import type { sessionAnalysisData } from "@/lib/data";
import { reference } from "@/lib/hyrox";
import { analyseHyrox, analyseRun, type Insight, type Rep, type Tile } from "@/lib/sessionAnalysis";
import type { StreamSummary } from "@/lib/streams";

type Data = Awaited<ReturnType<typeof sessionAnalysisData>>;

const ZONE_COLORS = ["var(--c-other)", "var(--good)", "#eab308", "var(--accent)", "var(--bad)"];
const KIND_LABEL: Record<string, string> = {
  easy: "an easy run",
  long: "a long run",
  recovery: "a recovery run",
  threshold: "a threshold session",
  intervals: "an interval session",
  race: "a race",
};
const TONE: Record<Insight["tone"], { icon: string; color: string }> = {
  good: { icon: "✓", color: "var(--good)" },
  warn: { icon: "!", color: "var(--warn)" },
  info: { icon: "i", color: "var(--c-run)" },
};

/** Pace & heart-rate analysis for one session: charts, zones, insights, splits. */
export default function SessionAnalysis({ data, distanceM, movingS, decoupling, trainer }: { data: Data; distanceM: number | null; movingS: number; decoupling: number | null; trainer: boolean }) {
  const s = data.summary;
  const hasHr = !!s?.hr.some((h) => h !== null) || !!data.avgHr;
  if (!data.run && !data.isHyrox && !hasHr) return null;

  let tiles: Tile[];
  let insights: Insight[];
  let zones: number[] | null;
  let reps: Rep[] = [];
  let segments: { name: string; time: number; ref: number | null; run: boolean }[] = [];
  if (data.run) {
    const r = analyseRun({ kind: data.kind, summary: s, distanceM: distanceM ?? 0, movingS, avgHr: data.avgHr, maxHr: data.maxHr, zoneSeconds: data.zoneSeconds, decoupling, trainer, t: data.thresholds, baseline: data.baseline });
    ({ tiles, insights, zones, reps } = r);
  } else {
    const h = analyseHyrox({ summary: s, avgHr: data.avgHr, maxHr: data.maxHr, zoneSeconds: data.zoneSeconds, durationS: movingS, t: data.thresholds, splits: data.splits, reference: data.splits ? reference(data.division) : null, tenKPace: data.tenKPace });
    ({ tiles, insights, zones, segments } = h);
    // Race wording doesn't fit a gym class.
    if (!data.isHyrox) insights = insights.filter((x) => x.title !== "Intensity");
  }
  const title = data.run ? "Pace & heart rate" : data.isHyrox ? "HYROX analysis" : "Heart rate";
  const ltPace = data.thresholds.ltSpeed ? 1000 / data.thresholds.ltSpeed : null;

  return (
    <section className="card space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="label">{title}</div>
        {data.run && data.kind !== "steady" && <span className="text-xs text-muted">read as {KIND_LABEL[data.kind]}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-bg p-2.5">
            <div className="text-[11px] font-semibold uppercase text-muted">{t.label}</div>
            <div className="tabular mt-0.5 text-lg font-extrabold leading-tight">{t.value}</div>
            {t.sub && <div className="text-[11px] leading-tight text-muted">{t.sub}</div>}
          </div>
        ))}
      </div>

      {s ? (
        <TimelineChart s={s} thresholdHr={data.thresholds.thresholdHr} ltPace={data.run ? ltPace : null} reps={reps} />
      ) : (
        <p className="text-sm text-muted">{data.canFetch ? "No pace/HR timeline from Strava for this one — the numbers below use the session averages." : "Timeline appears for activities synced from Strava."}</p>
      )}

      {zones && (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Time in zones: ${zones.map((z, i) => `${HR_ZONE_NAMES[i]} ${Math.round(z * 100)}%`).join(", ")}`}>
            {zones.map((z, i) => (z > 0 ? <div key={i} style={{ width: `${z * 100}%`, background: ZONE_COLORS[i] }} /> : null))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {zones.map((z, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: ZONE_COLORS[i] }} />
                {HR_ZONE_NAMES[i].split(" ")[0]} {Math.round(z * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <ul className="space-y-2.5">
          {insights.map((x) => (
            <li key={x.title} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-bg" style={{ background: TONE[x.tone].color }} aria-hidden>
                {TONE[x.tone].icon}
              </span>
              <span className="min-w-0 text-sm">
                <b>{x.title}.</b> <span className="text-muted">{x.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {reps.length > 0 && (
        <Table
          caption={`${reps.length} reps found`}
          head={["Rep", "Time", "Dist", "Pace", "HR", "HR drop"]}
          rows={reps.map((r) => [String(r.n), formatDuration(r.time_s), r.distance_m >= 100 ? `${r.distance_m >= 1000 ? (r.distance_m / 1000).toFixed(2) + " km" : r.distance_m + " m"}` : "–", `${formatPace(r.pace)}`, r.hr ? `${r.hr}${r.maxHr ? ` (${r.maxHr})` : ""}` : "–", r.recoveryDrop !== null ? `−${r.recoveryDrop}` : "–"])}
          note={`Pace /km. HR in brackets is the rep's peak; HR drop is the fall in the first minute after. Times and distances are to the nearest ${data.summary?.step ?? 5} s of the recording.`}
        />
      )}

      {data.run && s && s.splits.length > 1 && reps.length === 0 && <Splits s={s} ltPace={ltPace} thresholdHr={data.thresholds.thresholdHr} />}

      {segments.length > 0 && (
        <Table
          caption="Splits vs a top-15% finisher"
          head={["Segment", "You", "Top 15%", "Gap"]}
          rows={segments.map((g) => [g.name, formatDuration(g.time), g.ref ? formatDuration(g.ref) : "–", g.ref ? `${g.time - g.ref >= 0 ? "+" : "−"}${formatDuration(Math.abs(g.time - g.ref))}` : "–"])}
          highlight={segments.map((g) => (g.ref && g.time - g.ref > 20 ? "warn" : null))}
        />
      )}
    </section>
  );
}

function Table({ caption, head, rows, note, highlight }: { caption: string; head: string[]; rows: string[][]; note?: string; highlight?: ("warn" | null)[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{caption}</div>
      <table className="tabular w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-1 font-normal ${i ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, k) => (
            <tr key={k}>
              {r.map((c, i) => (
                <td key={i} className={`py-1.5 ${i ? "text-right" : ""} ${i === r.length - 1 && highlight?.[k] ? "font-bold text-warn" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

/** Km splits with a bar for pace (longer = faster) and HR coloured by zone. */
function Splits({ s, ltPace, thresholdHr }: { s: StreamSummary; ltPace: number | null; thresholdHr: number }) {
  const paces = s.splits.map((x) => (x.time_s / x.distance_m) * 1000);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const zone = (h: number) => { const f = h / thresholdHr; return f < 0.85 ? 0 : f < 0.9 ? 1 : f < 0.95 ? 2 : f < 1 ? 3 : 4; };
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">Km splits</span>
        {ltPace && <span>threshold {formatPace(ltPace)}/km</span>}
      </div>
      <ul className="tabular space-y-1 text-sm">
        {s.splits.map((x, i) => {
          const p = paces[i];
          // At least a 30 s/km range, so a 1-second difference doesn't look dramatic.
          const range = Math.max(30, slowest - fastest);
          const w = 40 + ((slowest - p) / range) * 60;
          return (
            <li key={x.km} className="grid grid-cols-[2.2rem_1fr_3.2rem_2.6rem] items-center gap-2">
              <span className="text-muted">{x.distance_m < 990 ? `${(x.distance_m / 1000).toFixed(2)}` : x.km}</span>
              <span className="h-2 rounded-full bg-border">
                <span className="block h-2 rounded-full" style={{ width: `${w}%`, background: p === fastest && slowest - fastest >= 3 ? "var(--good)" : "var(--c-run)" }} />
              </span>
              <span className="text-right font-semibold">{formatPace(p)}</span>
              <span className="text-right" style={{ color: x.hr ? ZONE_COLORS[zone(x.hr)] : undefined }}>{x.hr ?? "–"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[11px] text-muted">Pace /km · HR coloured by zone. Green bar: fastest km.</p>
    </div>
  );
}

/** Pace (top, when there's distance) and heart rate (bottom) on a shared time axis. */
function TimelineChart({ s, thresholdHr, ltPace, reps }: { s: StreamSummary; thresholdHr: number; ltPace: number | null; reps: Rep[] }) {
  const W = 326;
  const padL = 34;
  const padR = 6;
  const total = s.t[s.t.length - 1] + s.step;
  const x = (t: number) => padL + (t / total) * (W - padL - padR);
  const speeds = s.speed.filter((v): v is number => v !== null && v > 1.5);
  const hrs = s.hr.filter((h): h is number => h !== null);
  const showPace = speeds.length > s.speed.length * 0.3;
  const paceH = 86;
  const hrH = 86;
  const gap = 14;
  const H = (showPace ? paceH + gap : 0) + hrH + 16;

  const sorted = [...speeds].sort((a, b) => a - b);
  const vLo = sorted[Math.floor(sorted.length * 0.03)] ?? 2;
  const top = sorted[Math.floor(sorted.length * 0.99)] ?? 4;
  // Show the threshold line only when you ran close to it (otherwise it squashes an easy run flat).
  const ltSpeed = ltPace && top >= (1000 / ltPace) * 0.92 ? 1000 / ltPace : null;
  const vHi = Math.max(top, ltSpeed ?? 0);
  const vy = (v: number) => 4 + ((vHi - Math.max(vLo, Math.min(vHi, v))) / Math.max(0.1, vHi - vLo)) * (paceH - 8);
  const hrTop = showPace ? paceH + gap : 0;
  const hLo = Math.min(...hrs, thresholdHr * 0.8) - 3;
  const hHi = Math.max(...hrs, thresholdHr) + 3;
  const hy = (h: number) => hrTop + 4 + ((hHi - h) / (hHi - hLo)) * (hrH - 8);

  const path = (vals: (number | null)[], y: (v: number) => number, ok: (v: number) => boolean) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null || !ok(v)) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(s.t[i] + s.step / 2).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const mins = Math.round(total / 60);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((f * total) / 60));

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {showPace && <Key color="var(--c-run)" label="Pace /km" />}
        <Key color="var(--bad)" label="Heart rate" />
        <Key color="var(--muted)" dashed label={`threshold${ltSpeed && showPace ? ` (${formatPace(1000 / ltSpeed)}/km, ` : " ("}${thresholdHr} bpm)`} />
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-good/20" />zones 1–2</span>
        {reps.length > 0 && <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-accent/20" />reps</span>}
      </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${showPace ? "Pace and heart rate" : "Heart rate"} over ${mins} minutes${reps.length ? `, ${reps.length} reps shaded` : ""}`}>
      {reps.map((r) => (
        <rect key={r.n} x={x(r.start)} y={0} width={Math.max(1, x(r.start + r.time_s) - x(r.start))} height={H - 16} fill="var(--accent)" opacity={0.08} />
      ))}
      {showPace && (
        <g>
          <text x={padL - 4} y={vy(vHi) + 4} textAnchor="end" fontSize={9} fill="var(--muted)">{formatPace(1000 / vHi)}</text>
          <text x={padL - 4} y={vy(vLo)} textAnchor="end" fontSize={9} fill="var(--muted)">{formatPace(1000 / vLo)}</text>
          {ltSpeed && <line x1={padL} x2={W - padR} y1={vy(ltSpeed)} y2={vy(ltSpeed)} stroke="var(--c-run)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />}
          <path d={path(s.speed, vy, (v) => v > 1.5)} fill="none" stroke="var(--c-run)" strokeWidth={2} strokeLinejoin="round" />
        </g>
      )}
      <g>
        <rect x={padL} y={hy(thresholdHr * 0.9)} width={W - padL - padR} height={Math.max(0, hy(hLo) - hy(thresholdHr * 0.9))} fill="var(--good)" opacity={0.08} />
        <line x1={padL} x2={W - padR} y1={hy(thresholdHr)} y2={hy(thresholdHr)} stroke="var(--bad)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />

        <text x={padL - 4} y={hy(hHi) + 6} textAnchor="end" fontSize={9} fill="var(--muted)">{Math.round(hHi)}</text>
        <text x={padL - 4} y={hy(hLo)} textAnchor="end" fontSize={9} fill="var(--muted)">{Math.round(hLo)}</text>
        <path d={path(s.hr, hy, () => true)} fill="none" stroke="var(--bad)" strokeWidth={2} strokeLinejoin="round" />
      </g>
      {ticks.map((m, i) => (
        <text key={i} x={x(m * 60)} y={H - 3} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize={9} fill="var(--muted)">{m}′</text>
      ))}
    </svg>
    </div>
  );
}

function Key({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width="14" height="6" aria-hidden><line x1="0" x2="14" y1="3" y2="3" stroke={color} strokeWidth={2} strokeDasharray={dashed ? "3 2" : undefined} /></svg>
      {label}
    </span>
  );
}
