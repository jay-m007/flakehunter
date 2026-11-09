// PLANTED: order dependence (needs an earlier test). b-uses-setup.test.js only passes if this file ran first.
const test = require("node:test");
const fs = require("node:fs");
const { file } = require("./_shared.js");
test("writes the shared config", () => { fs.writeFileSync(file("config.json"), "{}"); });
