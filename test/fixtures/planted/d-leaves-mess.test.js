const test = require("node:test");
const fs = require("node:fs");
const { file } = require("./_shared.js");
test("fills the cache and forgets to clean up", () => { fs.writeFileSync(file("cache.dirty"), "x"); });
