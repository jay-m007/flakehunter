const test = require("node:test");
const assert = require("node:assert");
test("adds", () => { assert.equal(1 + 1, 2); });
test.describe("strings", () => {
  test("upper-cases", () => { assert.equal("a".toUpperCase(), "A"); });
  test("trims", () => { assert.equal(" a ".trim(), "a"); });
});
