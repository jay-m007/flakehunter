// PLANTED: hidden network use. Talks to a local server through the machine's LAN address.
const test = require("node:test");
const assert = require("node:assert");
const net = require("node:net");
const os = require("node:os");
const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
test("reaches the local service by its LAN address", { skip: lan ? false : "no LAN interface on this machine" }, async () => {
  const server = net.createServer((s) => s.end("ok")).listen(0, "0.0.0.0");
  await new Promise((r) => server.once("listening", r));
  try {
    const data = await new Promise((resolve, reject) => {
      const c = net.connect({ host: lan.address, port: server.address().port }, () => {});
      let buf = ""; c.on("data", (d) => (buf += d)); c.on("end", () => resolve(buf)); c.on("error", reject);
    });
    assert.equal(data, "ok");
  } finally { server.close(); }
});
