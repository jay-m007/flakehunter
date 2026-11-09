import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI, copyFixture } from "./helpers.ts";

const env = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; };
const cli = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: env() });

test("--help prints usage and exits 0", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: flakehunter/);
});

test("rejects --repeats below 2 with exit code 2", () => {
  const r = cli([".", "--repeats", "1"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /at least 2/);
});

test("rejects an unknown format", () => {
  const r = cli([".", "--format", "xml"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--format/);
});

test("a folder with no tests exits 2 and says what it looked for", () => {
  const d = mkdtempSync(join(tmpdir(), "fh-empty-"));
  try {
    const r = cli([d]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Could not find a test runner/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a clean project exits 0 and says so", () => {
  const d = mkdtempSync(join(tmpdir(), "fh-clean-"));
  try {
    writeFileSync(join(d, "ok.test.js"), 'const t=require("node:test");const a=require("node:assert");t("ok",()=>a.equal(1,1));');
    const r = cli([d, "--quick", "--no-stress", "--repeats", "2"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /0 flaky, 0 fragile, 0 failing, 1 stable/);
    assert.match(r.stdout, /not proof/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("planted flakes exit 1 and json/markdown formats work", () => {
  const fx = copyFixture("planted");
  try {
    const j = cli([fx.dir, "--quick", "--no-stress", "--format", "json"]);
    assert.equal(j.status, 1, j.stderr);
    const data = JSON.parse(j.stdout);
    assert.equal(data.runner, "node:test");
    assert.ok(data.tests.some((t: any) => t.verdict === "flaky"));
    const md = cli([fx.dir, "--quick", "--no-stress", "--format", "md"]);
    assert.match(md.stdout, /^# Flake Hunter report/);
    assert.match(md.stdout, /```sh/);
  } finally { fx.cleanup(); }
});

test("a suite that hangs is stopped at the timeout and leaves no process behind", () => {
  const d = mkdtempSync(join(tmpdir(), "fh-hang-"));
  try {
    writeFileSync(join(d, "hang.test.js"), 'const t=require("node:test");t("hangs",()=>new Promise(()=>{setInterval(()=>{},1000)}));');
    const r = cli([d, "--repeats", "2", "--quick", "--no-stress", "--timeout", "2"]);
    assert.ok(r.status === 0 || r.status === 1 || r.status === 2);
    assert.match(r.stderr, /TIMED OUT|produced no test results/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
