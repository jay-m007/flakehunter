import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage", ".flakehunter"]);

export function walk(dir: string, accept: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (SKIP.has(name)) continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) go(p);
      else if (accept(relative(dir, p))) out.push(relative(dir, p));
    }
  };
  go(dir);
  return out;
}

export function readPackageJson(dir: string): Record<string, any> | undefined {
  const p = join(dir, "package.json");
  if (!existsSync(p)) return undefined;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return undefined; }
}

export function hasDependency(dir: string, name: string): boolean {
  const pj = readPackageJson(dir);
  return !!pj && !!(pj.dependencies?.[name] || pj.devDependencies?.[name]);
}

/** Small seeded generator so a shuffle can be replayed from its seed. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
