// PLANTED: intermittent failure with no external cause. It fails on every even-numbered run, so the fixture is repeatable.
const test = require("node:test");
const assert = require("node:assert");
const { run } = require("./_shared.js");
test("sometimes fails by itself", () => { assert.ok(Number(run) % 2 === 1, "unlucky run " + run); });
