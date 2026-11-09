// node:test reporter: one JSON line per finished test, prefixed so it can be told from other output.
export default async function* reporter(source) {
  for await (const e of source) {
    if (e.type !== "test:pass" && e.type !== "test:fail") continue;
    const d = e.data;
    if (d.details && d.details.type === "suite") continue;
    const err = d.details && d.details.error;
    const msg = err ? String((err.cause && err.cause.message) || err.message || err).slice(0, 600) : undefined;
    const status = e.type === "test:pass" ? (d.skip || d.todo ? "skip" : "pass") : "fail";
    yield JSON.stringify({ fh: 1, s: status, n: d.name, f: d.file, m: msg }) + "\n";
  }
}
