import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { analyze } from "../src/analyze.ts";
import { copyFixture } from "./helpers.ts";
import type { Analysis, TestVerdict } from "../src/types.ts";

let a: Analysis;
let cleanup: () => void;
const by = (file: string): TestVerdict => {
  const t = a.tests.find((x) => x.file === file);
  assert.ok(t, `no result for ${file}`);
  return t;
};

before(async () => {
  const fx = copyFixture("planted");
  cleanup = fx.cleanup;
  a = await analyze(fx.dir, { repeats: 4, quick: false, stress: true, timeoutMs: 120_000, maxIsolate: 10, log: () => {} });
});
after(() => {
  cleanup?.();
  for (const d of readdirSync(tmpdir())) if (d.startsWith("fh-planted-")) rmSync(`${tmpdir()}/${d}`, { recursive: true, force: true });
});

const cause = (file: string) => by(file).findings.map((f) => f.cause);

test("detects the runner", () => assert.equal(a.runner, "node:test"));
test("order: relies on an earlier test", () => { assert.equal(by("b-uses-setup.test.js").verdict, "fragile"); assert.equal(cause("b-uses-setup.test.js")[0], "order"); // a parallel run may also trip over the same dependency
  assert.ok(cause("b-uses-setup.test.js").every((c) => c === "order" || c === "concurrency")); assert.match(by("b-uses-setup.test.js").findings[0].evidence.join(" "), /fails when run alone/); });
test("order: leaked state from another test", () => { assert.equal(cause("c-expects-clean.test.js")[0], "order"); assert.ok(cause("c-expects-clean.test.js").every((c) => c === "order" || c === "concurrency")); assert.match(by("c-expects-clean.test.js").findings[0].evidence.join(" "), /passes when run alone/); });
test("timezone", () => assert.deepEqual(cause("e-timezone.test.js"), ["timezone"]));
test("clock", () => assert.deepEqual(cause("f-clock.test.js"), ["clock"]));
test("network", () => assert.deepEqual(cause("g-network.test.js"), ["network"]));
test("timing under CPU load", () => assert.deepEqual(cause("h-timing.test.js"), ["timing"]));
test("shared port when files run in parallel", () => {
  const ports = a.tests.filter((t) => t.file.startsWith("i-port"));
  const bad = ports.filter((t) => t.verdict === "fragile");
  assert.ok(bad.length >= 1, "at least one of the two port files loses the race");
  for (const t of bad) assert.deepEqual(t.findings.map((f) => f.cause), ["concurrency"]);
});
test("intermittent with no outside cause is flaky", () => { assert.equal(by("j-intermittent.test.js").verdict, "flaky"); assert.deepEqual(cause("j-intermittent.test.js"), ["intermittent"]); });
test("always-failing is failing, not flaky", () => assert.equal(by("k-broken.test.js").verdict, "failing"));
test("stable tests stay stable, including ones inside describe()", () => {
  const stable = a.tests.filter((t) => t.file === "l-stable.test.js");
  assert.equal(stable.length, 3);
  assert.ok(stable.every((t) => t.verdict === "stable"));
});
test("no stable test is blamed on anything", () => assert.ok(a.tests.filter((t) => t.verdict === "stable").every((t) => t.findings.length === 0)));
test("every finding carries evidence and a reproduction", () => {
  for (const t of a.tests.filter((x) => x.verdict === "fragile" || x.verdict === "flaky")) {
    assert.ok(t.repro && t.repro.length > 10, `${t.file} lacks a repro`);
    for (const f of t.findings) assert.ok(f.evidence.length > 0);
  }
});
