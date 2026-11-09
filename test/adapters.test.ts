import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jestArgs } from "../src/adapters/jest.ts";
import { vitestArgs } from "../src/adapters/vitest.ts";
import { parseJestLike } from "../src/adapters/common.ts";
import { pickAdapter } from "../src/adapters/index.ts";
import { buildPlan, clockOffset } from "../src/plan.ts";
import { adapters } from "../src/adapters/index.ts";
import { seededShuffle } from "../src/files.ts";

const spec = (o: object) => ({ kind: "baseline" as const, label: "x", ...o });

test("jest args: baseline is serial, shuffle uses --randomize with a seed, only targets one test", () => {
  assert.deepEqual(jestArgs(spec({ parallel: false }), "/o.json").includes("--runInBand"), true);
  assert.equal(jestArgs(spec({ parallel: true }), "/o.json").some((a) => a.startsWith("--maxWorkers=")), true);
  const s = jestArgs(spec({ shuffleSeed: 7 }), "/o.json");
  assert.ok(s.includes("--randomize") && s.includes("--seed=7"));
  const o = jestArgs(spec({ only: { file: "a.test.js", name: "adds (1+1)" } }), "/o.json");
  assert.ok(o.includes("--runTestsByPath") && o.includes("^adds \\(1\\+1\\)$"));
});

test("vitest args: baseline disables file parallelism, shuffle sets seed", () => {
  assert.ok(vitestArgs(spec({ parallel: false }), "/o.json").includes("--no-file-parallelism"));
  assert.ok(!vitestArgs(spec({ parallel: true }), "/o.json").includes("--no-file-parallelism"));
  const s = vitestArgs(spec({ shuffleSeed: 3 }), "/o.json");
  assert.ok(s.includes("--sequence.shuffle") && s.includes("--sequence.seed=3"));
});

test("parses the Jest/Vitest JSON shape, including a suite that failed to load", () => {
  const json = JSON.stringify({ testResults: [
    { name: "/p/src/a.test.js", status: "failed", assertionResults: [
      { fullName: "math adds", status: "passed", failureMessages: [] },
      { fullName: "math divides", status: "failed", failureMessages: ["Error: expected 1\n at x"] },
      { fullName: "math todo", status: "todo", failureMessages: [] },
    ] },
    { name: "/p/src/b.test.js", status: "failed", message: "Cannot find module", assertionResults: [] },
  ] });
  const r = parseJestLike(json, "/p");
  assert.deepEqual(r.map((t) => [t.id, t.status]), [
    ["src/a.test.js::math adds", "pass"], ["src/a.test.js::math divides", "fail"], ["src/a.test.js::math todo", "skip"], ["src/b.test.js::(suite failed to run)", "fail"],
  ]);
  assert.match(r[1].message ?? "", /expected 1/);
});

test("runner detection prefers vitest, then jest, then node:test files", () => {
  const d = mkdtempSync(join(tmpdir(), "fh-detect-"));
  try {
    writeFileSync(join(d, "a.test.js"), 'require("node:test")');
    assert.equal(pickAdapter(d).name, "node:test");
    mkdirSync(join(d, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { jest: "^29" } }));
    writeFileSync(join(d, "node_modules/.bin/jest"), "");
    assert.equal(pickAdapter(d).name, "jest");
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { jest: "^29", vitest: "^2" } }));
    writeFileSync(join(d, "node_modules/.bin/vitest"), "");
    assert.equal(pickAdapter(d).name, "vitest");
    assert.equal(pickAdapter(d, "node:test").name, "node:test");
    assert.throws(() => pickAdapter(d, "mocha"), /Unknown runner/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("plan: every non-baseline run changes one thing; jest has no clock runs and says why", () => {
  const nt = buildPlan({ repeats: 3, quick: false, stress: true, canShuffle: true, adapter: adapters["node:test"] });
  assert.equal(nt.specs.filter((s) => s.kind === "baseline").length, 3);
  for (const s of nt.specs.filter((s) => s.kind !== "baseline")) {
    const changes = [s.shuffleSeed !== undefined || s.reverse, s.parallel, s.env?.TZ, s.clock, s.preload?.includes("net-block"), s.stress].filter(Boolean).length;
    assert.equal(changes, 1, s.label);
  }
  const j = buildPlan({ repeats: 3, quick: false, stress: true, canShuffle: true, adapter: adapters.jest });
  assert.equal(j.specs.some((s) => s.kind === "clock"), false);
  assert.ok(j.notes.some((n) => /Clock shifting skipped/.test(n)));
});

test("plan: current TZ is not used as a perturbation; single file skips shuffle with a note", () => {
  const p = buildPlan({ repeats: 2, quick: true, stress: false, canShuffle: false, adapter: adapters["node:test"], currentTz: "Pacific/Kiritimati" });
  assert.equal(p.specs.some((s) => s.kind === "tz"), false);
  assert.equal(p.specs.some((s) => s.kind === "shuffle"), false);
  assert.ok(p.notes.some((n) => /only one test file/.test(n)));
  assert.ok(p.notes.some((n) => /--no-stress/.test(n)));
});

test("clock offsets land just before midnight and new year", () => {
  const now = new Date(2026, 5, 10, 13, 30, 0);
  const mid = new Date(now.getTime() + clockOffset("midnight", now));
  assert.equal(mid.getDate(), 10);
  assert.equal(mid.getHours(), 23);
  assert.equal(mid.getMinutes(), 59);
  assert.equal(mid.getSeconds(), 58);
  const ny = new Date(now.getTime() + clockOffset("year-end", now));
  assert.equal(ny.getMonth(), 11);
  assert.equal(ny.getDate(), 31);
  assert.equal(ny.getSeconds(), 58);
  assert.equal(clockOffset("future", now), 400 * 86_400_000);
});

test("seeded shuffle is repeatable and a permutation", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const a = seededShuffle(items, 5), b = seededShuffle(items, 5), c = seededShuffle(items, 6);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual([...a].sort((x, y) => x - y), items);
});
