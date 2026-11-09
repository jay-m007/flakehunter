// PLANTED: always fails. Must be reported as failing, not flaky.
const test = require("node:test");
const assert = require("node:assert");
test("is simply broken", () => { assert.equal(1 + 1, 3); });
