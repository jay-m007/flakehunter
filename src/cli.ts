import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyze } from "./analyze.ts";
import { exitCode, renderJson, renderMarkdown, renderText } from "./report.ts";

const HELP = `flakehunter: find flaky tests and say why they flake

Usage: flakehunter [project-dir] [options]

Runs your test suite several times, then again with one thing changed at a time
(test order, parallel files, timezone, clock, network, CPU load), and reports
which tests are flaky and what they depend on.

Options:
  --runner <name>     node:test, jest or vitest (default: detected)
  --repeats <n>       identical baseline runs (default 5)
  --quick             fewer perturbation runs (about half the time)
  --no-stress         skip the CPU-load runs
  --timeout <sec>     limit for one run of the suite (default 300)
  --max-isolate <n>   order-sensitive tests to re-run alone (default 10)
  --format <f>        text, md or json (default text)
  --out <file>        write the report to a file instead of stdout
  -h, --help          show this help

Exit code: 0 nothing flaky found, 1 flaky or fragile tests found, 2 usage or runner error.
Progress goes to stderr, the report to stdout.
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      runner: { type: "string" }, repeats: { type: "string" }, quick: { type: "boolean" }, "no-stress": { type: "boolean" },
      timeout: { type: "string" }, "max-isolate": { type: "string" }, format: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) { process.stdout.write(HELP); return 0; }
  const num = (v: string | undefined, d: number, name: string) => {
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a whole number of at least 1.`);
    return n;
  };
  const repeats = num(values.repeats, 5, "repeats");
  if (repeats < 2) throw new Error("--repeats must be at least 2: one run cannot show a test failing on its own.");
  const format = values.format ?? "text";
  if (!["text", "md", "json"].includes(format)) throw new Error(`--format must be text, md or json (got "${format}").`);
  const dir = resolve(positionals[0] ?? ".");
  const analysis = await analyze(dir, {
    runner: values.runner, repeats: values.quick ? Math.min(repeats, 3) : repeats, quick: !!values.quick, stress: !values["no-stress"],
    timeoutMs: num(values.timeout, 300, "timeout") * 1000, maxIsolate: num(values["max-isolate"], 10, "max-isolate"),
    log: (m) => process.stderr.write(m + "\n"),
  });
  const text = format === "json" ? renderJson(analysis) : format === "md" ? renderMarkdown(analysis) : renderText(analysis);
  if (values.out) writeFileSync(values.out, text); else process.stdout.write(text);
  return exitCode(analysis);
}

main().then((c) => process.exit(c), (e) => { process.stderr.write(`flakehunter: ${e instanceof Error ? e.message : e}\n`); process.exit(2); });
