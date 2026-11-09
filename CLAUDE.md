# Flake Hunter

CLI that finds flaky JavaScript tests and says why they flake: it re-runs a suite while changing one thing at a time (order, timezone, clock, parallelism, network, CPU load) and classifies each test from the evidence.

## Commands
- `npm test`: offline test suite (node:test; planted-flake fixtures in `test/fixtures`)
- `npm run typecheck`: `tsc --noEmit`
- `node src/cli.ts <dir>`: analyse a project (Node 22.18+ runs .ts directly)
- `node bench/run.ts`: accuracy numbers on planted flakes

## Code rules
- TypeScript run by Node's type stripping: no enums, namespaces or constructor parameter properties; use `import type` for types; relative imports end in `.ts`.
- Zero runtime dependencies. Use node: built-ins only. Preload scripts in `src/preload` are plain CommonJS/ESM JavaScript.
- Never claim a cause the evidence does not support: every verdict lists the runs that back it. Say what each adapter cannot perturb in the README.
- Add a test for every new perturbation or classification rule. Tests must not need the network.
- Never leave child processes behind: kill process groups on timeout and on exit.

## Git
- Commits are authored as Jay Maurya <maurya67jay@gmail.com>. Do not add co-author or "generated with" lines to commits or pull requests.
