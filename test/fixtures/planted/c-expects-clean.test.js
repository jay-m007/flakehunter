// PLANTED: order dependence (leak). Passes alone; fails if d-leaves-mess.test.js ran before it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { file } = require("./_shared.js");
test("starts with an empty cache", () => { assert.ok(!fs.existsSync(file("cache.dirty")), "cache was left dirty by another test"); });
