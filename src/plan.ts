import type { Adapter, RunSpec } from "./types.ts";

export interface PlanOptions {
  repeats: number;
  quick: boolean;
  stress: boolean;
  canShuffle: boolean;
  adapter: Adapter;
  currentTz?: string;
}

/** The ordered list of runs. Every run changes exactly one thing from the baseline. */
export function buildPlan(o: PlanOptions): { specs: RunSpec[]; notes: string[] } {
  const specs: RunSpec[] = [];
  const notes: string[] = [];
  for (let i = 1; i <= o.repeats; i++) specs.push({ kind: "baseline", label: `baseline ${i}/${o.repeats}`, parallel: false });

  if (o.adapter.caps.shuffle && o.canShuffle) {
    if (o.adapter.caps.reverse) specs.push({ kind: "shuffle", label: "reversed file order", parallel: false, reverse: true });
    const seeds = o.quick ? (o.adapter.caps.reverse ? [] : [1]) : [1, 2];
    for (const s of seeds) specs.push({ kind: "shuffle", label: `shuffled order (seed ${s})`, parallel: false, shuffleSeed: s });
  } else notes.push(o.adapter.caps.shuffle ? "Order shuffling skipped: there is only one test file, and node:test cannot reorder tests inside a file." : `Order shuffling is not supported for ${o.adapter.name}.`);

  if (o.adapter.caps.parallel) {
    for (let i = 1; i <= (o.quick ? 1 : 2); i++) specs.push({ kind: "parallel", label: `parallel files (${i})`, parallel: true });
  }

  const zones = (o.quick ? ["Pacific/Kiritimati"] : ["Pacific/Kiritimati", "America/Anchorage"]).filter((z) => z !== o.currentTz);
  for (const z of zones) specs.push({ kind: "tz", label: `TZ=${z}`, parallel: false, env: { TZ: z } });

  if (o.adapter.caps.clock) {
    const clocks: ("midnight" | "year-end" | "future")[] = o.quick ? ["midnight"] : ["midnight", "year-end", "future"];
    const names = { midnight: "1.5 s before local midnight", "year-end": "1.5 s before new year", future: "400 days in the future" };
    for (const c of clocks) specs.push({ kind: "clock", label: `clock ${names[c]}`, parallel: false, preload: ["clock-shift"], clock: c });
  } else notes.push(`Clock shifting skipped: ${o.adapter.name} runs tests in a sandbox with its own Date, which a process-level shift cannot reach. Timezone changes still apply.`);

  specs.push({ kind: "network", label: "network blocked", parallel: false, preload: ["net-block"] });

  if (o.stress) {
    for (let i = 1; i <= (o.quick ? 1 : 2); i++) specs.push({ kind: "stress", label: `CPU load (${i})`, parallel: false, stress: -1 });
  } else notes.push("CPU stress skipped (--no-stress).");
  return { specs, notes };
}

/** Local-time clock scenarios, as an offset from now in ms. */
export function clockOffset(kind: "midnight" | "year-end" | "future", now = new Date()): number {
  const t = now.getTime();
  if (kind === "future") return 400 * 86_400_000;
  if (kind === "midnight") {
    const next = new Date(now); next.setHours(24, 0, 0, 0);
    return next.getTime() - 1500 - t;
  }
  const ny = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  return ny.getTime() - 1500 - t;
}
