import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ROOT } from "./helpers.ts";
import { join } from "node:path";

const run = (code: string, preload: string, env: Record<string, string> = {}) => {
  const e: NodeJS.ProcessEnv = { ...process.env, ...env, NODE_OPTIONS: `--require=${join(ROOT, "src/preload", preload)}` };
  delete e.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env: e });
};

test("net-block refuses non-loopback connections but allows loopback", () => {
  const code = `
    const net=require("net");
    const s=net.createServer(c=>c.end("hi")).listen(0,"127.0.0.1",()=>{
      const out=[];
      const a=net.connect({host:"127.0.0.1",port:s.address().port});
      a.on("data",d=>out.push("loopback:"+d)); a.on("close",()=>{
        const b=net.connect(80,"192.0.2.55"); b.on("error",e=>{out.push("remote:"+e.code);
          const c=net.connect({host:"example.invalid",port:80}); c.on("error",e2=>{out.push("host:"+e2.code); console.log(out.join(",")); s.close();});});
      });
    });`;
  const r = run(code, "net-block.cjs");
  assert.equal(r.stdout.trim(), "loopback:hi,remote:ENETUNREACH,host:ENETUNREACH");
});

test("net-block makes DNS lookups of real hostnames fail with ENOTFOUND", () => {
  const r = run(`require("dns").lookup("example.com",e=>console.log(e&&e.code));`, "net-block.cjs");
  assert.equal(r.stdout.trim(), "ENOTFOUND");
  const p = run(`require("dns").promises.lookup("example.com").catch(e=>console.log(e.code));`, "net-block.cjs");
  assert.equal(p.stdout.trim(), "ENOTFOUND");
  const l = run(`require("dns").lookup("localhost",(e,a)=>console.log(e?"err":"ok"));`, "net-block.cjs");
  assert.equal(l.stdout.trim(), "ok");
});

test("clock-shift moves new Date() and Date.now() but leaves explicit dates alone", () => {
  const code = `const d=Date.now()-0;console.log(JSON.stringify([ (new Date().getTime()-Date.now())<50, Date.now()>Date.UTC(2100,0,1), new Date(2020,0,1).getFullYear(), new Date() instanceof Date ]))`;
  const r = run(code, "clock-shift.cjs", { FH_CLOCK_OFFSET_MS: String(Date.UTC(2100, 0, 2) - Date.now()) });
  assert.equal(r.stdout.trim(), "[true,true,2020,true]");
  const off = run(`console.log(Date.now()<Date.UTC(2100,0,1))`, "clock-shift.cjs");
  assert.equal(off.stdout.trim(), "true");
});
