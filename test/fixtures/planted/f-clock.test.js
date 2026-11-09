// PLANTED: clock dependence. Breaks only when run within 5 seconds before midnight.
const test = require("node:test");
const assert = require("node:assert");
test("a session issued now expires on the same calendar day", () => {
  const issued = new Date();
  const expires = new Date(issued.getTime() + 5000);
  assert.equal(expires.getDate(), issued.getDate());
});
