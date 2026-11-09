import type { Analysis, TestVerdict } from "./types.ts";

const LABEL = { flaky: "FLAKY", fragile: "FRAGILE", failing: "FAILING", stable: "stable" } as const;
const MEANING = {
  flaky: "fails on its own in identical runs",
  fragile: "passes normally, fails when one thing changes",
  failing: "fails every time (not flaky, just broken)",
} as const;

export function counts(a: Analysis) {
  const c = { flaky: 0, fragile: 0, failing: 0, stable: 0 };
  for (const t of a.tests) c[t.verdict]++;
  return c;
}

export function exitCode(a: Analysis): number {
  const c = counts(a);
  return c.flaky + c.fragile > 0 ? 1 : 0;
}

function why(t: TestVerdict): string[] {
  const out: string[] = [];
  for (const f of t.findings) {
    out.push(`${f.summary} [${f.confidence} confidence]`);
    for (const e of f.evidence) out.push(`  - ${e}`);
  }
  return out;
}

export function renderText(a: Analysis): string {
  const c = counts(a);
  const L: string[] = [];
  L.push(`Flake Hunter: ${a.tests.length} tests, ${a.runs.length} runs with ${a.runner} in ${(a.totalMs / 1000).toFixed(0)}s`);
  L.push(`  ${c.flaky} flaky, ${c.fragile} fragile, ${c.failing} failing, ${c.stable} stable`);
  for (const verdict of ["flaky", "fragile", "failing"] as const) {
    const ts = a.tests.filter((t) => t.verdict === verdict);
    if (!ts.length) continue;
    L.push("", `${LABEL[verdict]} (${MEANING[verdict]})`);
    for (const t of ts) {
      L.push(`  ${t.file} > ${t.name}`);
      for (const w of why(t)) L.push(`    ${w}`);
      if (verdict === "failing" && t.messages[0]) L.push(`    error: ${t.messages[0]}`);
      if (t.repro && verdict !== "failing") L.push(`    reproduce: ${t.repro}`);
    }
  }
  if (a.notes.length) L.push("", "Not covered:", ...a.notes.map((n) => `  - ${n}`));
  if (!c.flaky && !c.fragile) L.push("", "No flaky or fragile tests found under these conditions. That is not proof there are none.");
  return L.join("\n") + "\n";
}

export function renderMarkdown(a: Analysis): string {
  const c = counts(a);
  const L: string[] = [];
  L.push("# Flake Hunter report", "");
  L.push(`${a.tests.length} tests, ${a.runs.length} runs with ${a.runner} in ${(a.totalMs / 1000).toFixed(0)} s.`, "");
  L.push("| Flaky | Fragile | Failing | Stable |", "|---|---|---|---|", `| ${c.flaky} | ${c.fragile} | ${c.failing} | ${c.stable} |`, "");
  for (const verdict of ["flaky", "fragile", "failing"] as const) {
    const ts = a.tests.filter((t) => t.verdict === verdict);
    if (!ts.length) continue;
    L.push(`## ${LABEL[verdict]}: ${MEANING[verdict]}`, "");
    for (const t of ts) {
      L.push(`### \`${t.name}\``, "", `File: \`${t.file}\``, "");
      for (const f of t.findings) {
        L.push(`**${f.summary}** (${f.confidence} confidence)`, "");
        for (const e of f.evidence) L.push(`- ${e}`);
        L.push("");
      }
      if (verdict === "failing" && t.messages[0]) L.push(`Error: \`${t.messages[0]}\``, "");
      if (t.repro && verdict !== "failing") L.push("Reproduce:", "", "```sh", t.repro, "```", "");
    }
  }
  if (a.notes.length) L.push("## Not covered", "", ...a.notes.map((n) => `- ${n}`), "");
  L.push("<details><summary>All runs</summary>", "", "| # | Run | Passed | Failed | Seconds |", "|---|---|---|---|---|", ...a.runs.map((r) => `| ${r.no} | ${r.label} | ${r.passed} | ${r.failed} | ${(r.ms / 1000).toFixed(1)} |`), "", "</details>", "");
  return L.join("\n");
}

export function renderJson(a: Analysis): string { return JSON.stringify(a, null, 2) + "\n"; }
