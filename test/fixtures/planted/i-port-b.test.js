// PLANTED: shared resource. Both i-port files bind the same fixed port and hold it for a while.
const test = require("node:test");
const net = require("node:net");
test("binds the fixed test port (b)", async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(39517, "127.0.0.1", resolve); });
  await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => server.close(r));
});
