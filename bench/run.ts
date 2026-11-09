// Accuracy on the planted-flake fixture: does Flake Hunter name the right cause, and does it leave stable tests alone?
// Usage: node bench/run.ts [rounds]   (default 5). Writes bench/results.json.
import { rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { analyze } from "../src/analyze.ts";
import { copyFixture } from "../test/helpers.ts";
import type { Analysis } from "../src/types.ts";

const rounds = Number(process.argv[2] ?? 5);

/** file -> [expected verdict, expected first cause or undefined] */
const TRUTH: Record<string, [string, string | undefined]> = {
  "b-uses-setup.test.js": ["fragile", "order"],
  "c-expects-clean.test.js": ["fragile", "order"],
  "e-timezone.test.js": ["fragile", "timezone"],
  "f-clock.test.js": ["fragile", "clock"],
  "g-network.test.js": ["fragile", "network"],
  "h-timing.test.js": ["fragile", "timing"],
  "j-intermittent.test.js": ["flaky", "intermittent"],
  "k-broken.test.js": ["failing", undefined],
};
const PORT = ["i-port-a.test.js", "i-port-b.test.js"];
const CLEAN = ["a-setup.test.js", "d-leaves-mess.test.js", "l-stable.test.js"];

const perRound: any[] = [];
for (let i = 1; i <= rounds; i++) {
  const fx = copyFixture("planted");
  let a: Analysis;
  try { a = await analyze(fx.dir, { repeats: 5, quick: false, stress: true, timeoutMs: 120_000, maxIsolate: 10, log: () => {} }); } finally { fx.cleanup(); }
  const hit: Record<string, boolean> = {};
  for (const [file, [verdict, cause]] of Object.entries(TRUTH)) {
    const t = a.tests.find((x) => x.file === file);
    hit[file] = !!t && t.verdict === verdict && (cause === undefined || t.findings[0]?.cause === cause);
  }
  const ports = a.tests.filter((t) => PORT.includes(t.file) && t.verdict === "fragile");
  hit["port (at least one file, cause concurrency)"] = ports.length >= 1 && ports.every((t) => t.findings.every((f) => f.cause === "concurrency"));
  const falsePositives = a.tests.filter((t) => CLEAN.includes(t.file) && t.verdict !== "stable").map((t) => t.id);
  perRound.push({ round: i, seconds: Math.round(a.totalMs / 1000), runs: a.runs.length, hit, falsePositives });
  console.log(`round ${i}: ${Object.values(hit).filter(Boolean).length}/${Object.keys(hit).length} correct, ${falsePositives.length} false positives, ${Math.round(a.totalMs / 1000)}s`);
}
for (const d of readdirSync(tmpdir())) if (d.startsWith("fh-planted-")) rmSync(`${tmpdir()}/${d}`, { recursive: true, force: true });

const names = Object.keys(perRound[0].hit);
const summary = {
  rounds, node: process.version, cpus: (await import("node:os")).cpus().length,
  perKind: Object.fromEntries(names.map((n) => [n, `${perRound.filter((r) => r.hit[n]).length}/${rounds}`])),
  falsePositiveRounds: perRound.filter((r) => r.falsePositives.length).length,
  meanSeconds: Math.round(perRound.reduce((s, r) => s + r.seconds, 0) / rounds),
  runsPerAnalysis: perRound[0].runs,
  perRound,
};
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ ...summary, perRound: undefined }, null, 2));
