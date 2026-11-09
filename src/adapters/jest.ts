import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "../runner.ts";
import { hasDependency } from "../files.ts";
import { childEnv, cmdline, escapeRegex, parseJestLike, workers } from "./common.ts";
import type { Adapter, RunInput, RunOutcome } from "../types.ts";

/** Builds the argument list; split out so tests can check it without Jest installed. */
export function jestArgs(spec: RunInput["spec"], outFile: string): string[] {
  const args = ["--json", `--outputFile=${outFile}`, "--silent", "--ci"];
  args.push(spec.parallel ? `--maxWorkers=${workers()}` : "--runInBand");
  if (spec.shuffleSeed !== undefined) args.push("--randomize", `--seed=${spec.shuffleSeed}`);
  if (spec.only) args.push("--runTestsByPath", spec.only.file, "-t", `^${escapeRegex(spec.only.name)}$`);
  return args;
}

export const jest: Adapter = {
  name: "jest",
  // Jest runs tests in a vm context with its own Date, so a process-level clock shift cannot reach test code.
  caps: { shuffle: true, reverse: false, clock: false, parallel: true, only: true },
  detect(dir) { return hasDependency(dir, "jest") && existsSync(join(dir, "node_modules/.bin/jest")); },
  canShuffle() { return true; },
  async run(input: RunInput): Promise<RunOutcome> {
    const tmp = mkdtempSync(join(tmpdir(), "fh-jest-"));
    const out = join(tmp, "out.json");
    try {
      const bin = join(input.dir, "node_modules/.bin/jest");
      const args = jestArgs(input.spec, out);
      const env = childEnv(input);
      const r = await exec(bin, args, { cwd: input.dir, env, timeoutMs: input.timeoutMs, stress: input.stress });
      let results: RunOutcome["results"] = [];
      if (existsSync(out)) { try { results = parseJestLike(readFileSync(out, "utf8"), input.dir); } catch { /* crashed mid-write */ } }
      return { results, code: r.code, timedOut: r.timedOut, ms: r.ms, cmdline: cmdline(input, env, "jest", args), tail: (r.stderr || r.stdout).slice(-600) };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  },
};
