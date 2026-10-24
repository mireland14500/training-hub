/** Line over the last N days with your normal range shaded — drawn on the server, no JS. */
export default function BandSparkline({
  points,
  band,
  label,
  color = "var(--c-run)",
  width = 326,
  height = 90,
  invert = false,
  margin = 3,
}: {
  points: (number | null)[];
  band: [number, number] | null;
  label: string;
  color?: string;
  width?: number;
  height?: number;
  /** Lower is better (e.g. pace): plot smaller values higher. */
  invert?: boolean;
  /** Space above and below the data, in the data's units. */
  margin?: number;
}) {
  const vals = points.filter((v): v is number => v !== null);
  if (vals.length < 2) return <p className="text-sm text-muted">Not enough data yet.</p>;
  const lo = Math.min(...vals, band?.[0] ?? Infinity) - margin;
  const hi = Math.max(...vals, band?.[1] ?? -Infinity) + margin;
  const pad = 4;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (v: number) => pad + ((invert ? v - lo : hi - v) / (hi - lo)) * (height - 2 * pad);
  const coords = points.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const lastIdx = points.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
      {band && <rect x={0} y={Math.min(y(band[0]), y(band[1]))} width={width} height={Math.max(2, Math.abs(y(band[0]) - y(band[1])))} rx={6} fill="var(--good)" opacity={0.13} />}
      <polyline fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={coords} />
      {lastIdx >= 0 && <circle cx={x(lastIdx)} cy={y(points[lastIdx]!)} r={4} fill={color} />}
    </svg>
  );
}
