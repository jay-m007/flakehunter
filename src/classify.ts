import type { Cause, Finding, Kind, RunRecord, Status, TestVerdict } from "./types.ts";

interface Entry { run: RunRecord; status: Status; message?: string }

const NAMES: Record<Exclude<Kind, "baseline" | "isolate">, string> = {
  shuffle: "shuffled-order", parallel: "parallel-files", tz: "timezone-changed", clock: "clock-shifted", network: "network-blocked", stress: "CPU-loaded",
};

/** What a failure message hints at, when the perturbations alone do not explain it. */
export function hintFromMessage(msg: string): { cause: Cause; why: string } | undefined {
  if (/EADDRINUSE|address already in use/i.test(msg)) return { cause: "concurrency", why: "a port was already in use" };
  if (/EEXIST|EBUSY|ENOTEMPTY|EMFILE/i.test(msg)) return { cause: "concurrency", why: "a file or resource was already taken" };
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up/i.test(msg)) return { cause: "network", why: "a network call failed" };
  if (/timed? ?out|exceeded timeout|Timeout/i.test(msg)) return { cause: "timing", why: "an operation timed out" };
  return undefined;
}

function short(m: string | undefined): string { return (m ?? "").split("\n").find((l) => l.trim())?.trim().slice(0, 160) ?? ""; }

export function classify(runs: RunRecord[], isolated: RunRecord[]): TestVerdict[] {
  const byId = new Map<string, { file: string; name: string; entries: Entry[] }>();
  for (const run of runs) {
    for (const r of run.outcome.results) {
      let t = byId.get(r.id);
      if (!t) byId.set(r.id, (t = { file: r.file, name: r.name, entries: [] }));
      t.entries.push({ run, status: r.status, message: r.message });
    }
  }
  const isoById = new Map<string, Entry[]>();
  for (const run of isolated) for (const r of run.outcome.results) {
    const a = isoById.get(r.id) ?? []; a.push({ run, status: r.status, message: r.message }); isoById.set(r.id, a);
  }

  const verdicts: TestVerdict[] = [];
  for (const [id, t] of byId) {
    const counted = (es: Entry[]) => es.filter((e) => e.status !== "skip");
    const base = counted(t.entries.filter((e) => e.run.spec.kind === "baseline"));
    if (!base.length) continue; // never ran in the baseline: nothing to compare with
    const baseFail = base.filter((e) => e.status === "fail");
    const messages = [...new Set(t.entries.filter((e) => e.status === "fail" && e.message).map((e) => short(e.message)))].filter(Boolean).slice(0, 3);
    const findings: Finding[] = [];
    let verdict: TestVerdict["verdict"] = "stable";
    let reproRun: RunRecord | undefined;

    if (baseFail.length === base.length) {
      verdict = "failing";
      reproRun = baseFail[0].run;
    } else if (baseFail.length > 0) {
      verdict = "flaky";
      reproRun = baseFail[0].run;
      const hint = hintFromMessage(baseFail.map((e) => e.message ?? "").join("\n"));
      findings.push({
        cause: hint?.cause ?? "intermittent",
        confidence: hint ? "low" : "low",
        summary: hint ? `Fails on its own in identical runs; the error suggests ${hint.why}.` : "Fails on its own in identical runs and none of the changes explain it.",
        evidence: [`failed ${baseFail.length} of ${base.length} identical baseline runs (runs ${baseFail.map((e) => e.run.no).join(", ")})`, ...messages.slice(0, 1)],
      });
    } else {
      const kinds = ["shuffle", "parallel", "tz", "clock", "network", "stress"] as const;
      for (const kind of kinds) {
        const es = counted(t.entries.filter((e) => e.run.spec.kind === kind));
        const fails = es.filter((e) => e.status === "fail");
        if (!fails.length) continue;
        verdict = "fragile";
        reproRun ??= fails[0].run;
        const all = fails.length === es.length;
        const evidence = [`passed in all ${base.length} baseline runs, failed in ${fails.length} of ${es.length} ${NAMES[kind]} runs: ${fails.map((e) => e.run.spec.label).join("; ")}`];
        const m = short(fails[0].message); if (m) evidence.push(`error: ${m}`);
        const f = SUMMARY[kind](evidence, isoById.get(id));
        findings.push({ cause: f.cause, confidence: all ? "high" : "medium", summary: f.summary, evidence });
      }
    }
    if (findings.some((f) => f.cause === "order")) {
      for (const f of findings) if (f.cause === "concurrency") f.evidence.push("it also depends on test order, so this is probably the same cross-test dependency showing up when files overlap");
    }
    verdicts.push({
      id, file: t.file, name: t.name, verdict, baseline: { runs: base.length, failures: baseFail.length }, findings, messages,
      repro: reproRun ? reproRun.outcome.cmdline : undefined,
    });
  }
  const order = { flaky: 0, fragile: 1, failing: 2, stable: 3 } as const;
  return verdicts.sort((a, b) => order[a.verdict] - order[b.verdict] || a.id.localeCompare(b.id));
}

const SUMMARY: Record<"shuffle" | "parallel" | "tz" | "clock" | "network" | "stress", (ev: string[], iso?: Entry[]) => { cause: Cause; summary: string }> = {
  shuffle(ev, iso) {
    const done = iso?.filter((e) => e.status !== "skip") ?? [];
    if (done.length && done.every((e) => e.status === "pass")) {
      ev.push("passes when run alone, so another test leaves something behind that breaks it");
      return { cause: "order", summary: "Depends on test order: a test that runs before it leaves state behind (shared variable, file, database row, mock)." };
    }
    if (done.length && done.every((e) => e.status === "fail")) {
      ev.push("also fails when run alone, so it needs an earlier test to set something up");
      return { cause: "order", summary: "Depends on test order: it relies on an earlier test to set up state instead of setting it up itself." };
    }
    return { cause: "order", summary: "Depends on test order: fails when the tests run in a different order." };
  },
  parallel: () => ({ cause: "concurrency", summary: "Fails when test files run at the same time but passes one at a time: files share a port, a temp file, a database or another resource." }),
  tz: () => ({ cause: "timezone", summary: "Depends on the machine's timezone: it passes in the default zone and fails in another." }),
  clock: () => ({ cause: "clock", summary: "Depends on the current date or time: it breaks near midnight, at year end, or when the date moves forward." }),
  network: () => ({ cause: "network", summary: "Quietly needs the network: it fails when connections to non-local hosts are refused. Mock the call or point it at a local server." }),
  stress: () => ({ cause: "timing", summary: "Timing-sensitive: it passes on an idle machine and fails when the CPU is busy (tight timeouts, fixed sleeps, or races)." }),
};
