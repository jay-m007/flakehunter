import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CLI = join(ROOT, "src/cli.ts");
export const FIXTURES = join(ROOT, "test/fixtures");

/** A private copy of a fixture, so runs never share files with each other or the repo. */
export function copyFixture(name: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fh-test-"));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
