"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/fuel";

/** Live countdown to a race start (local time on this device). Renders after mount to avoid a server/client mismatch. */
export default function Countdown({ date, startTime, size = "lg" }: { date: string; startTime: string | null; size?: "lg" | "sm" }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className={size === "lg" ? "text-4xl font-extrabold" : "font-bold"}>&nbsp;</span>;

  const start = new Date(`${date}T${startTime ?? "00:00"}:00`);
  const c = countdown(now, start);
  const isToday = now.toDateString() === start.toDateString();
  const big = size === "lg" ? "text-4xl font-extrabold" : "text-lg font-extrabold";
  const unit = size === "lg" ? "text-base font-semibold text-muted" : "text-xs font-semibold text-muted";

  if (c.past || (isToday && !startTime)) return <span className={big}>{c.past && !isToday ? "Done 🏁" : "Race day 🔥"}</span>;
  const parts: [number, string][] = c.days > 0 ? [[c.days, c.days === 1 ? "day" : "days"], [c.hours, "h"]] : [[c.hours, "h"], [c.minutes, "min"]];
  return (
    <span className="tabular inline-flex items-baseline gap-1.5" aria-live="off">
      {parts.map(([v, u]) => (
        <span key={u} className="inline-flex items-baseline gap-1">
          <span className={big}>{v}</span>
          <span className={unit}>{u}</span>
        </span>
      ))}
    </span>
  );
}
