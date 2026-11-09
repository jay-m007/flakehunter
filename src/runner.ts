// Runs one command with a time limit, optional CPU stress beside it, and no orphans left behind.
import { spawn } from "node:child_process";
import { cpus } from "node:os";

export interface ExecResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; ms: number }

const MAX_OUT = 32 * 1024 * 1024;
const live = new Set<number>();

function killGroup(pid: number | undefined): void {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
}

process.on("exit", () => { for (const pid of live) killGroup(pid); });
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { for (const pid of live) killGroup(pid); process.exit(130); });

export function stressWorkers(factor: number): number { return Math.max(2, cpus().length * factor); }

function startStress(n: number, ttlMs: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = spawn(process.execPath, ["-e", `const e=Date.now()+${Math.ceil(ttlMs)};while(Date.now()<e);`], { stdio: "ignore", detached: true });
    c.unref();
    if (c.pid) { pids.push(c.pid); live.add(c.pid); }
  }
  return pids;
}

export function exec(cmd: string, args: string[], o: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; stress?: number }): Promise<ExecResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const stressPids = o.stress ? startStress(o.stress, o.timeoutMs + 5000) : [];
    const child = spawn(cmd, args, { cwd: o.cwd, env: o.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    if (child.pid) live.add(child.pid);
    let stdout = "", stderr = "", timedOut = false, done = false;
    const cap = (s: string, d: Buffer) => (s.length < MAX_OUT ? s + d.toString("utf8") : s);
    child.stdout.on("data", (d: Buffer) => { stdout = cap(stdout, d); });
    child.stderr.on("data", (d: Buffer) => { stderr = cap(stderr, d); });
    const timer = setTimeout(() => { timedOut = true; killGroup(child.pid); }, o.timeoutMs);
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      killGroup(child.pid); // children the suite forgot to stop
      if (child.pid) live.delete(child.pid);
      for (const p of stressPids) { killGroup(p); live.delete(p); }
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - t0 });
    };
    child.on("error", (e) => { stderr += String(e); finish(null); });
    child.on("close", (code) => finish(code));
  });
}
