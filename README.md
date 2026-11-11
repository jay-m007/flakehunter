# Flake Hunter

Finds flaky JavaScript tests and tells you **why** they flake.

Most flaky-test tools tell you a test failed once and passed on retry. Flake Hunter runs your suite again and again, changing **one thing at a time** (test order, parallel files, timezone, clock, network, CPU load), and compares each run with a calm baseline. A test that only fails when the clock moves is a clock problem; one that only fails when files run together shares a port or a file. Every verdict lists the runs that back it and a command to reproduce it.

Zero runtime dependencies. Node 22.18+. Works with `node:test`, Jest and Vitest.

## Try it

```sh
git clone https://github.com/jay-m007/flakehunter.git
cd flakehunter && npm install && npm run build
node bin/flakehunter.js /path/to/your/project
```

Not on npm yet. Useful options:

```
--quick           about half the runs
--repeats <n>     identical baseline runs (default 5)
--no-stress       skip the CPU-load runs
--format md|json  report format (default text)
--runner <name>   node:test, jest or vitest (default: detected)
```

Exit code is `0` when nothing flaky is found, `1` when flaky or fragile tests are found, `2` on usage or runner errors. Progress goes to stderr and the report to stdout, so `flakehunter --format md > report.md` works in CI.

## What the report looks like

This is real output on the planted-flake project in `test/fixtures/planted` (trimmed):

```
Flake Hunter: 15 tests, 21 runs with node:test in 56s
  1 flaky, 7 fragile, 1 failing, 6 stable

FLAKY (fails on its own in identical runs)
  j-intermittent.test.js > sometimes fails by itself
    Fails on its own in identical runs and none of the changes explain it. [low confidence]
      - failed 2 of 5 identical baseline runs (runs 2, 4)

FRAGILE (passes normally, fails when one thing changes)
  e-timezone.test.js > a noon-UTC timestamp falls on the same local day
    Depends on the machine's timezone: it passes in the default zone and fails in another. [medium confidence]
      - passed in all 5 baseline runs, failed in 1 of 2 timezone-changed runs: TZ=Pacific/Kiritimati
      - error: 11 == 10
  b-uses-setup.test.js > reads the shared config
    Depends on test order: it relies on an earlier test to set up state instead of setting it up itself. [high confidence]
      - passed in all 5 baseline runs, failed in 3 of 3 shuffled-order runs
      - also fails when run alone, so it needs an earlier test to set something up
  g-network.test.js > reaches the local service by its LAN address
    Quietly needs the network: it fails when connections to non-local hosts are refused. [high confidence]
      - error: connect ENETUNREACH 192.0.2.2 (network blocked by flakehunter)
```

Each fragile test also prints a `reproduce:` command (left out above).

## How it works

1. **Baseline.** The suite runs several times, one test file at a time in natural order. Same conditions each time. A test that fails some of these runs is **flaky** with no outside cause visible.
2. **One change per run.** Each of these changes a single thing from the baseline:

| Run | What changes | Finding if a baseline-passing test now fails |
|---|---|---|
| reversed / shuffled order | file order (and test order for Jest/Vitest) | **order**: leaves or needs state. Re-run alone to tell a leak from a missing setup |
| parallel files | files run at the same time | **concurrency**: shared port, temp file or database |
| `TZ=Pacific/Kiritimati`, `America/Anchorage` | timezone | **timezone** |
| clock 1.5 s before midnight / new year / +400 days | `Date` | **clock** |
| network blocked | connections to non-loopback hosts fail | **network** |
| CPU load | busy-loop processes beside the suite | **timing** |

3. **Classify.** A test that passes the whole baseline but fails under a change is **fragile**: a latent flake. A test that fails every baseline run is **failing** (broken, not flaky). If a test breaks under both parallel files and CPU load, the parallel failure is demoted to low confidence, because plain CPU contention explains it.

Each finding has a confidence: **high** when every run of that kind failed it, **medium** when only some did, **low** for hints taken from an error message.

Your tests can read `FLAKEHUNTER_RUN` (run number) and `FLAKEHUNTER_SESSION` (unique per analysis) to keep per-run temp directories apart.

## What each runner can and cannot do

| | node:test | Jest | Vitest |
|---|---|---|---|
| File order | reversed and seeded shuffle | n/a | n/a |
| Test order | **not possible** (node:test cannot reorder tests inside a file) | `--randomize --seed` | `--sequence.shuffle --sequence.seed` |
| Run one test alone | yes | yes | yes |
| Timezone | yes | yes | yes |
| Clock shift | yes | **no**: Jest tests run in a sandbox with their own `Date` | yes |
| Network block | yes | yes | yes |

The report lists anything it skipped under "Not covered".

## Honest limits

- **Little real-world testing so far.** It has been run on four real projects of mine (two node:test, two Vitest; 23 to 54 tests each) and on small Jest and Vitest projects with planted flakes; see "Real projects" below. Running it on other people's repositories is still to do.
- **The 45/45 is not an accuracy claim.** I fixed two classifier problems after the first benchmark round, so the fixture shaped the tool. Treat it as a regression check.
- **No proof of absence.** "Nothing found" means nothing broke under these conditions, not that the suite is stable. Flakes that need a specific data race, a particular machine, or a long uptime will be missed.
- **It re-runs your tests about 20 times.** Tests with real side effects (a shared database, emails, payments) can be damaged by that. Point it at a test environment.
- **Network blocking is JavaScript-level.** It patches Node's `net` and `dns` in the test process and its Node children. Native add-ons, other languages and tools outside Node are not blocked. Loopback (127.x, `localhost`) stays open.
- **Clock shifting changes the global `Date` only.** Code that reads time another way (`performance.now`, native timers, fake-timer libraries that replace `Date`) is not shifted.
- **CPU stress is crude.** It starts a few busy loops per CPU. Results depend on the machine; on a one-CPU box it tells you less.
- **Parallel runs use Node's or the runner's default worker counts**, not your project's config.
- **Intermittent failures with no outside cause stay "unexplained".** That is a finding, but not a diagnosis.
- Linux and macOS only in practice. Windows is untested.

## Benchmark

`node bench/run.ts` analyses `test/fixtures/planted` five times (21 runs each) and writes `bench/results.json`. On a 2-CPU Linux machine with Node 22.22:

| Planted flake | Named correctly |
|---|---|
| order, needs an earlier test | 5/5 |
| order, leaked state | 5/5 |
| timezone | 5/5 |
| clock | 5/5 |
| network | 5/5 |
| timing under CPU load | 5/5 |
| shared port | 5/5 |
| intermittent | 5/5 |
| always failing (reported as failing, not flaky) | 5/5 |

No stable test was flagged in any round. One analysis takes about 56 s. The first version of this table had timing at 3/5; the parallel run was being blamed for a failure that CPU load explained, which is why that rule exists.

## Real projects

Quick mode (`--quick`) on my own repositories, 2-CPU Linux machine, Node 22:

| Project | Runner | Tests | Runs | Time | Found |
|---|---|---|---|---|---|
| [unbreak](https://github.com/jay-m007/unbreak) | node:test | 23 | 9 | 1 min 46 s | nothing |
| [pocketcloud](https://github.com/jay-m007/pocketcloud) | node:test | 15 | 9 | 1 min 12 s | nothing |
| [archguard](https://github.com/jay-m007/archguard) | Vitest | 54 | 8 | 1 min 30 s | nothing |
| [contextcode](https://github.com/jay-m007/contextcode) | Vitest | 44 | 8 | 47 s | nothing |

Nothing found is the expected result for small offline suites, and it is not proof they are stable. These runs show the tool works on real suites without false alarms; they do not show it finds real flakes.

To check the Jest and Vitest adapters against the real tools, I also ran it on two tiny projects (Jest 29.7 and Vitest) with planted order, timezone, clock and network flakes. Vitest: order, timezone and clock found. Jest: order, timezone and network found; clock skipped as documented. These runs found one bug: in `--quick` mode Jest and Vitest got no shuffled run at all. Fixed.

## Use in CI

```yaml
name: Flake check
on: { schedule: [{ cron: "0 3 * * 1" }], workflow_dispatch: {} }
jobs:
  flakes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx --yes github:jay-m007/flakehunter . --quick --format md > flakes.md || true
      - uses: actions/upload-artifact@v4
        with: { name: flake-report, path: flakes.md }
```

## Develop

```sh
npm test            # 46 offline tests, including the planted-flake analysis
npm run typecheck
node bench/run.ts
```

TypeScript run by Node's type stripping, no build step in development. MIT licensed.
