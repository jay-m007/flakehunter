// PLANTED: relies on a-setup.test.js having run first; fails alone and when shuffled before it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { file } = require("./_shared.js");
test("reads the shared config", () => { assert.ok(fs.existsSync(file("config.json")), "config.json missing"); });
