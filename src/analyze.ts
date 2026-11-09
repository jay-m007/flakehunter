import { cpus } from "node:os";
import { pickAdapter } from "./adapters/index.ts";
import { classify } from "./classify.ts";
import { buildPlan, clockOffset } from "./plan.ts";
import { stressWorkers } from "./runner.ts";
import type { Analysis, RunRecord, RunSpec } from "./types.ts";

export interface Options {
  runner?: string;
  repeats: number;
  quick: boolean;
  stress: boolean;
  timeoutMs: number;
  maxIsolate: number;
  log: (msg: string) => void;
}

export async function analyze(dir: string, o: Options): Promise<Analysis> {
  const t0 = Date.now();
  const adapter = pickAdapter(dir, o.runner);
  const { specs, notes } = buildPlan({ repeats: o.repeats, quick: o.quick, stress: o.stress, canShuffle: adapter.canShuffle(dir), adapter, currentTz: process.env.TZ });
  const records: RunRecord[] = [];
  let no = 0;
  const session = `${process.pid}-${Date.now().toString(36)}`;

  const once = async (spec: RunSpec, total: string): Promise<RunRecord> => {
    no++;
    const env: NodeJS.ProcessEnv = { ...process.env, FLAKEHUNTER_RUN: String(no), FLAKEHUNTER_SESSION: session };
    delete env.NODE_TEST_CONTEXT; // otherwise a flakehunter started from inside node:test would make its child behave as a sub-test
    if (spec.clock) env.FH_CLOCK_OFFSET_MS = String(Math.round(clockOffset(spec.clock)));
    const stress = spec.stress ? stressWorkers(4) : 0;
    const outcome = await adapter.run({ dir, spec, env, timeoutMs: o.timeoutMs, stress });
    const c = { pass: 0, fail: 0, skip: 0 };
    for (const r of outcome.results) c[r.status]++;
    o.log(`[${total}] ${spec.label}: ${c.pass} passed, ${c.fail} failed${c.skip ? `, ${c.skip} skipped` : ""}${outcome.timedOut ? ", TIMED OUT" : ""} (${(outcome.ms / 1000).toFixed(1)}s)`);
    return { no, spec, outcome };
  };

  let i = 0;
  for (const spec of specs) records.push(await once(spec, `${++i}/${specs.length}`));

  const baseline = records.filter((r) => r.spec.kind === "baseline");
  if (baseline.every((r) => r.outcome.results.length === 0)) {
    throw new Error(`The ${adapter.name} runner produced no test results in ${dir}.\n${baseline[0]?.outcome.tail ?? ""}\nCommand: ${baseline[0]?.outcome.cmdline}`);
  }

  // Order-dependence needs one more question: does the test still fail when it runs alone?
  const baseIds = new Set<string>();
  for (const r of baseline) for (const t of r.outcome.results) if (t.status === "pass") baseIds.add(t.id);
  const shuffleFailed = new Map<string, { file: string; name: string }>();
  for (const r of records.filter((r) => r.spec.kind === "shuffle")) for (const t of r.outcome.results) {
    if (t.status === "fail" && baseIds.has(t.id)) shuffleFailed.set(t.id, { file: t.file, name: t.name });
  }
  const isolated: RunRecord[] = [];
  if (adapter.caps.only && shuffleFailed.size) {
    const picks = [...shuffleFailed.values()].slice(0, o.maxIsolate);
    if (shuffleFailed.size > picks.length) notes.push(`Ran ${picks.length} of ${shuffleFailed.size} order-sensitive tests alone (--max-isolate).`);
    let k = 0;
    for (const p of picks) isolated.push(await once({ kind: "isolate", label: `alone: ${p.name}`, parallel: false, only: p }, `isolate ${++k}/${picks.length}`));
  }

  const tests = classify(records, isolated);
  const all = [...records, ...isolated];
  return {
    dir, runner: adapter.name, startedAt: new Date(t0).toISOString(), totalMs: Date.now() - t0,
    runs: all.map((r) => ({
      no: r.no, label: r.spec.label, kind: r.spec.kind, ms: r.outcome.ms,
      passed: r.outcome.results.filter((t) => t.status === "pass").length, failed: r.outcome.results.filter((t) => t.status === "fail").length,
      skipped: r.outcome.results.filter((t) => t.status === "skip").length, crashed: r.outcome.timedOut || (r.outcome.results.length === 0), cmdline: r.outcome.cmdline,
    })),
    tests, notes: [...notes, ...(cpus().length < 2 ? ["Only one CPU: CPU-load runs are less telling."] : [])],
  };
}
