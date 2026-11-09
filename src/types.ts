export type Status = "pass" | "fail" | "skip";
export type RunnerName = "node:test" | "jest" | "vitest";
export type Kind = "baseline" | "shuffle" | "parallel" | "tz" | "clock" | "network" | "stress" | "isolate";

export interface TestResult {
  /** Stable id: "<file relative to the project>::<full test name>". */
  id: string;
  file: string;
  name: string;
  status: Status;
  message?: string;
}

/** Everything that can differ between one run of the suite and another. */
export interface RunSpec {
  kind: Kind;
  label: string;
  /** Seeded shuffle of test order (adapter decides what that can shuffle). */
  shuffleSeed?: number;
  /** Run test files in reverse natural order (flips every pair, so any order dependence shows). */
  reverse?: boolean;
  /** false = one test file at a time, natural order (the baseline condition). */
  parallel?: boolean;
  /** Extra environment (e.g. TZ). */
  env?: Record<string, string>;
  /** Plain-JS preloads from src/preload to inject via NODE_OPTIONS. */
  preload?: ("net-block" | "clock-shift")[];
  /** Clock scenario for the clock-shift preload. */
  clock?: "midnight" | "year-end" | "future";
  /** Number of busy-loop processes to run alongside the suite. */
  stress?: number;
  /** Run only this test. */
  only?: { file: string; name: string };
}

export interface RunInput {
  dir: string;
  spec: RunSpec;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  stress: number;
}

export interface RunOutcome {
  results: TestResult[];
  code: number | null;
  timedOut: boolean;
  ms: number;
  cmdline: string;
  tail: string;
}

export interface Adapter {
  name: RunnerName;
  /** What this runner lets Flake Hunter perturb. */
  caps: { shuffle: boolean; reverse: boolean; clock: boolean; parallel: boolean; only: boolean };
  detect(dir: string): boolean;
  /** Can a shuffle change anything in this project? */
  canShuffle(dir: string): boolean;
  run(input: RunInput): Promise<RunOutcome>;
}

export interface RunRecord {
  no: number;
  spec: RunSpec;
  outcome: RunOutcome;
}

export type Cause = "order" | "timezone" | "clock" | "network" | "timing" | "concurrency" | "intermittent";

export interface Finding {
  cause: Cause;
  confidence: "high" | "medium" | "low";
  summary: string;
  evidence: string[];
}

export type Verdict = "flaky" | "fragile" | "failing" | "stable";

export interface TestVerdict {
  id: string;
  file: string;
  name: string;
  verdict: Verdict;
  baseline: { runs: number; failures: number };
  findings: Finding[];
  messages: string[];
  repro?: string;
}

export interface Analysis {
  dir: string;
  runner: RunnerName;
  startedAt: string;
  totalMs: number;
  runs: { no: number; label: string; kind: Kind; ms: number; passed: number; failed: number; skipped: number; crashed: boolean; cmdline: string }[];
  tests: TestVerdict[];
  notes: string[];
}
