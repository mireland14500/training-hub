"use client";

import { useTransition } from "react";
import { deleteActivity, deleteBenchmark, setRpe } from "@/app/actions";

export function RpeSelect({ id, value }: { id: string; value: number | null }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="RPE"
      className="rounded-lg border border-border bg-bg px-1.5 py-1 text-xs"
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => e.target.value && start(() => setRpe(id, Number(e.target.value)))}
    >
      <option value="">RPE</option>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>RPE {n}</option>
      ))}
    </select>
  );
}

export function DeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="text-xs text-bad"
      disabled={pending}
      onClick={() => confirm("Delete this session?") && start(() => deleteActivity(id))}
    >
      Delete
    </button>
  );
}

export function BenchmarkDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-muted hover:text-bad" disabled={pending} aria-label="Delete benchmark" onClick={() => confirm("Delete this benchmark?") && start(() => deleteBenchmark(id))}>
      ✕
    </button>
  );
}
