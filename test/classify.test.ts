import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, hintFromMessage } from "../src/classify.ts";
import type { Kind, RunRecord, RunSpec, TestResult } from "../src/types.ts";

let n = 0;
function run(kind: Kind, results: TestResult[], extra: Partial<RunSpec> = {}): RunRecord {
  return { no: ++n, spec: { kind, label: `${kind} ${n}`, ...extra }, outcome: { results, code: 0, timedOut: false, ms: 1, cmdline: `cmd ${kind}`, tail: "" } };
}
const r = (name: string, status: "pass" | "fail", message?: string): TestResult => ({ id: `f.test.js::${name}`, file: "f.test.js", name, status, message });

test("a test that passes everywhere is stable", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("baseline", [r("a", "pass")]), run("tz", [r("a", "pass")])], []);
  assert.equal(v[0].verdict, "stable");
  assert.deepEqual(v[0].findings, []);
});

test("failing every baseline run is failing, not flaky", () => {
  const v = classify([run("baseline", [r("a", "fail", "boom")]), run("baseline", [r("a", "fail", "boom")])], []);
  assert.equal(v[0].verdict, "failing");
  assert.equal(v[0].findings.length, 0);
});

test("mixed baseline is flaky with an intermittent finding", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("baseline", [r("a", "fail", "nope")]), run("baseline", [r("a", "pass")])], []);
  assert.equal(v[0].verdict, "flaky");
  assert.equal(v[0].baseline.failures, 1);
  assert.equal(v[0].findings[0].cause, "intermittent");
});

test("mixed baseline with a port error is hinted as concurrency at low confidence", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("baseline", [r("a", "fail", "listen EADDRINUSE :::3000")])], []);
  assert.equal(v[0].findings[0].cause, "concurrency");
  assert.equal(v[0].findings[0].confidence, "low");
});

test("each perturbation maps to its cause", () => {
  const cases: [Kind, string][] = [["shuffle", "order"], ["parallel", "concurrency"], ["tz", "timezone"], ["clock", "clock"], ["network", "network"], ["stress", "timing"]];
  for (const [kind, cause] of cases) {
    const v = classify([run("baseline", [r("a", "pass")]), run("baseline", [r("a", "pass")]), run(kind, [r("a", "fail", "x")])], []);
    assert.equal(v[0].verdict, "fragile", kind);
    assert.equal(v[0].findings[0].cause, cause, kind);
    assert.equal(v[0].findings[0].confidence, "high", kind);
  }
});

test("confidence drops to medium when only some runs of a kind fail", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("tz", [r("a", "fail")]), run("tz", [r("a", "pass")])], []);
  assert.equal(v[0].findings[0].confidence, "medium");
});

test("order: isolation decides between leak and missing setup", () => {
  const base = [run("baseline", [r("a", "pass")]), run("shuffle", [r("a", "fail")])];
  const leak = classify(base, [run("isolate", [r("a", "pass")])]);
  assert.match(leak[0].findings[0].summary, /leaves state behind/);
  const setup = classify(base, [run("isolate", [r("a", "fail")])]);
  assert.match(setup[0].findings[0].summary, /relies on an earlier test/);
  const unknown = classify(base, []);
  assert.match(unknown[0].findings[0].summary, /different order/);
});

test("a test missing from the baseline is ignored", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("shuffle", [r("a", "pass"), r("b", "fail")])], []);
  assert.deepEqual(v.map((t) => t.name), ["a"]);
});

test("skipped runs are not counted as passes or failures", () => {
  const skip: TestResult = { id: "f.test.js::a", file: "f.test.js", name: "a", status: "skip" };
  const v = classify([run("baseline", [r("a", "pass")]), run("tz", [skip])], []);
  assert.equal(v[0].verdict, "stable");
});

test("verdicts sort flaky, fragile, failing, stable", () => {
  const v = classify([
    run("baseline", [r("s", "pass"), r("x", "fail"), r("fl", "pass"), r("fr", "pass")]),
    run("baseline", [r("s", "pass"), r("x", "fail"), r("fl", "fail"), r("fr", "pass")]),
    run("tz", [r("s", "pass"), r("x", "fail"), r("fl", "pass"), r("fr", "fail")]),
  ], []);
  assert.deepEqual(v.map((t) => t.verdict), ["flaky", "fragile", "failing", "stable"]);
});

test("message hints", () => {
  assert.equal(hintFromMessage("EADDRINUSE")?.cause, "concurrency");
  assert.equal(hintFromMessage("connect ECONNREFUSED 1.2.3.4:80")?.cause, "network");
  assert.equal(hintFromMessage("Exceeded timeout of 5000 ms")?.cause, "timing");
  assert.equal(hintFromMessage("expected 1 to equal 2"), undefined);
});

test("order plus parallel failures are linked as probably one cause", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("shuffle", [r("a", "fail")]), run("parallel", [r("a", "fail")])], []);
  assert.deepEqual(v[0].findings.map((f) => f.cause), ["order", "concurrency"]);
  assert.match(v[0].findings[1].evidence.join(" "), /same cross-test dependency/);
});

test("parallel plus CPU-load failures: timing leads, concurrency is demoted to low", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("parallel", [r("a", "fail")]), run("stress", [r("a", "fail")])], []);
  assert.deepEqual(v[0].findings.map((f) => f.cause), ["timing", "concurrency"]);
  assert.equal(v[0].findings[1].confidence, "low");
  assert.match(v[0].findings[1].evidence.join(" "), /CPU contention/);
});

test("parallel failure without CPU-load failure stays concurrency at high confidence", () => {
  const v = classify([run("baseline", [r("a", "pass")]), run("parallel", [r("a", "fail")]), run("stress", [r("a", "pass")])], []);
  assert.deepEqual(v[0].findings.map((f) => [f.cause, f.confidence]), [["concurrency", "high"]]);
});
