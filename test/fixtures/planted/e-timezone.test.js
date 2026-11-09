// PLANTED: timezone dependence. Breaks only where local time is 14 hours ahead of UTC.
const test = require("node:test");
const assert = require("node:assert");
test("a noon-UTC timestamp falls on the same local day", () => { assert.equal(new Date("2024-03-10T12:00:00Z").getDate(), 10); });
