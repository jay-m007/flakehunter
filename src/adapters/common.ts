import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import type { RunInput, TestResult } from "../types.ts";

export function preloadPath(name: string): string {
  return fileURLToPath(new URL(`../preload/${name}`, import.meta.url));
}

/** Builds the child environment: spec env, TZ, and NODE_OPTIONS preloads. */
export function childEnv(input: RunInput, clockOffsetMs?: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...input.env, ...(input.spec.env ?? {}) };
  const reqs: string[] = [];
  for (const p of input.spec.preload ?? []) reqs.push(`--require=${JSON.stringify(preloadPath(p + ".cjs")).slice(1, -1)}`);
  if (reqs.length) env.NODE_OPTIONS = [env.NODE_OPTIONS, ...reqs].filter(Boolean).join(" ");
  if (clockOffsetMs !== undefined) env.FH_CLOCK_OFFSET_MS = String(clockOffsetMs);
  return env;
}

/** The command as a person could paste it: env that mattered, then the program. */
export function cmdline(input: RunInput, env: NodeJS.ProcessEnv, cmd: string, args: string[]): string {
  const pre = Object.entries(input.spec.env ?? {}).map(([k, v]) => `${k}=${v}`);
  if (input.spec.preload?.length) pre.push(`NODE_OPTIONS="${(env.NODE_OPTIONS ?? "").trim()}"`);
  if (input.spec.clock) pre.push(`FH_CLOCK_OFFSET_MS=${env.FH_CLOCK_OFFSET_MS}`);
  const shown = args.filter((a) => !a.startsWith("--test-reporter=") && !a.startsWith("--outputFile=") && !a.startsWith("--json"));
  return [...pre, cmd, ...shown].join(" ") + (input.stress ? `   # with ${input.stress} busy-loop processes running beside it` : "");
}

export function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function workers(): number { return Math.max(2, cpus().length); }

/** Jest and Vitest's JSON reporters share one shape. */
export function parseJestLike(json: string, dir: string): TestResult[] {
  const data = JSON.parse(json);
  const out: TestResult[] = [];
  for (const file of data.testResults ?? []) {
    const rel = String(file.name ?? "").startsWith(dir) ? String(file.name).slice(dir.length).replace(/^\/+/, "") : String(file.name ?? "");
    const asserts = file.assertionResults ?? [];
    if (!asserts.length && file.status === "failed") {
      out.push({ id: `${rel}::(suite failed to run)`, file: rel, name: "(suite failed to run)", status: "fail", message: String(file.message ?? "").slice(0, 600) });
      continue;
    }
    for (const a of asserts) {
      const status = a.status === "passed" ? "pass" : a.status === "failed" ? "fail" : "skip";
      const name = String(a.fullName ?? a.title ?? "");
      out.push({ id: `${rel}::${name}`, file: rel, name, status, message: status === "fail" ? String((a.failureMessages ?? [])[0] ?? "").slice(0, 600) : undefined });
    }
  }
  return out;
}
