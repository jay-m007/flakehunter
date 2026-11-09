import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../runner.ts";
import { seededShuffle, walk } from "../files.ts";
import { childEnv, cmdline, escapeRegex, preloadPath, workers } from "./common.ts";
import type { Adapter, RunInput, RunOutcome, TestResult } from "../types.ts";

const TEST_FILE = /(^|[./_-])(test|spec)\.(c|m)?[jt]s$|(^|\/)test-[^/]*\.(c|m)?[jt]s$/;

export function discover(dir: string): string[] {
  return walk(dir, (rel) => TEST_FILE.test(rel));
}

function usesNodeTest(dir: string, files: string[]): boolean {
  return files.some((f) => /node:test/.test(readFileSync(join(dir, f), "utf8")));
}

export const nodeTest: Adapter = {
  name: "node:test",
  caps: { shuffle: true, reverse: true, clock: true, parallel: true, only: true },
  detect(dir) {
    const files = discover(dir);
    return files.length > 0 && usesNodeTest(dir, files);
  },
  canShuffle(dir) { return discover(dir).length > 1; },
  async run(input: RunInput): Promise<RunOutcome> {
    let files = discover(input.dir);
    const spec = input.spec;
    if (spec.reverse) files = files.slice().reverse();
    if (spec.shuffleSeed !== undefined) files = seededShuffle(files, spec.shuffleSeed);
    const base = ["--test", `--test-reporter=${preloadPath("nt-reporter.mjs")}`];
    if (spec.only) { files = [spec.only.file]; base.push(`--test-name-pattern=^${escapeRegex(spec.only.name)}$`); }
    const env = childEnv(input, spec.clock ? Number(input.env.FH_CLOCK_OFFSET_MS) : undefined);
    // `node --test` sorts the files it is given, so a chosen order is only possible by starting one process per file.
    const batches = spec.parallel ? [files] : files.map((f) => [f]);
    const results: TestResult[] = [];
    const t0 = Date.now();
    let code: number | null = 0, timedOut = false, tail = "";
    for (const batch of batches) {
      const left = input.timeoutMs - (Date.now() - t0);
      if (left <= 0) { timedOut = true; break; }
      const args = [...base, `--test-concurrency=${spec.parallel ? workers() : 1}`, ...batch];
      const r = await exec(process.execPath, args, { cwd: input.dir, env, timeoutMs: left, stress: input.stress });
      if (r.timedOut) timedOut = true;
      if (r.code !== 0) code = r.code;
      tail = (r.stderr || r.stdout).slice(-600) || tail;
      let seen = 0;
      for (const line of r.stdout.split("\n")) {
        if (!line.startsWith('{"fh":1')) continue;
        try {
          const e = JSON.parse(line);
          const rel = String(e.f ?? "").startsWith(input.dir) ? String(e.f).slice(input.dir.length).replace(/^\/+/, "") : String(e.f ?? "");
          results.push({ id: `${rel}::${e.n}`, file: rel, name: e.n, status: e.s, message: e.m });
          seen++;
        } catch { /* not ours */ }
      }
      if (!seen) results.push({ id: `${batch[0]}::(file produced no results)`, file: batch[0], name: "(file produced no results)", status: "fail", message: tail.split("\n").find((l) => l.trim()) });
    }
    let line: string;
    if (spec.parallel || batches.length === 1) line = cmdline(input, env, "node", ["--test", ...(spec.only ? [base[2]] : []), `--test-concurrency=${spec.parallel ? workers() : 1}`, ...batches[0]]);
    else {
      const one = cmdline({ ...input, stress: 0 }, env, "node", ["--test", '"$f"']);
      line = `for f in ${files.join(" ")}; do ${one}; done` + (input.stress ? `   # with ${input.stress} busy-loop processes running beside it` : "");
    }
    return { results, code, timedOut, ms: Date.now() - t0, cmdline: line, tail };
  },
};
