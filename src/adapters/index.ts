import { jest } from "./jest.ts";
import { nodeTest } from "./node-test.ts";
import { vitest } from "./vitest.ts";
import type { Adapter, RunnerName } from "../types.ts";

export const adapters: Record<RunnerName, Adapter> = { "node:test": nodeTest, jest, vitest };

export function pickAdapter(dir: string, forced?: string): Adapter {
  if (forced) {
    const a = adapters[forced as RunnerName];
    if (!a) throw new Error(`Unknown runner "${forced}". Use node:test, jest or vitest.`);
    return a;
  }
  for (const a of [vitest, jest, nodeTest]) if (a.detect(dir)) return a;
  throw new Error("Could not find a test runner. Looked for vitest or jest in node_modules, and *.test.* files that import node:test. Pass --runner to choose one.");
}
