import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "../runner.ts";
import { hasDependency } from "../files.ts";
import { childEnv, cmdline, escapeRegex, parseJestLike } from "./common.ts";
import type { Adapter, RunInput, RunOutcome } from "../types.ts";

export function vitestArgs(spec: RunInput["spec"], outFile: string): string[] {
  const args = ["run", "--reporter=json", `--outputFile=${outFile}`];
  if (!spec.parallel) args.push("--no-file-parallelism");
  if (spec.shuffleSeed !== undefined) args.push("--sequence.shuffle", `--sequence.seed=${spec.shuffleSeed}`);
  if (spec.only) args.push(spec.only.file, "-t", `^${escapeRegex(spec.only.name)}$`);
  return args;
}

export const vitest: Adapter = {
  name: "vitest",
  caps: { shuffle: true, reverse: false, clock: true, parallel: true, only: true },
  detect(dir) { return hasDependency(dir, "vitest") && existsSync(join(dir, "node_modules/.bin/vitest")); },
  canShuffle() { return true; },
  async run(input: RunInput): Promise<RunOutcome> {
    const tmp = mkdtempSync(join(tmpdir(), "fh-vitest-"));
    const out = join(tmp, "out.json");
    try {
      const bin = join(input.dir, "node_modules/.bin/vitest");
      const args = vitestArgs(input.spec, out);
      const env = { ...childEnv(input, input.spec.clock ? Number(input.env.FH_CLOCK_OFFSET_MS) : undefined), CI: "1" };
      const r = await exec(bin, args, { cwd: input.dir, env, timeoutMs: input.timeoutMs, stress: input.stress });
      let results: RunOutcome["results"] = [];
      if (existsSync(out)) { try { results = parseJestLike(readFileSync(out, "utf8"), input.dir); } catch { /* crashed mid-write */ } }
      return { results, code: r.code, timedOut: r.timedOut, ms: r.ms, cmdline: cmdline(input, env, "vitest", args), tail: (r.stderr || r.stdout).slice(-600) };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  },
};
