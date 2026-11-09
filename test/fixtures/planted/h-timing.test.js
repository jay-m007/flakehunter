// PLANTED: timing sensitivity. The test assumes it is never descheduled for more than 12 ms; a busy CPU breaks that.
const test = require("node:test");
const assert = require("node:assert");
test("keeps running without long pauses", () => {
  let maxGap = 0, last = process.hrtime.bigint();
  const end = last + 300_000_000n;
  for (let now = last; now < end; now = process.hrtime.bigint()) {
    const gap = Number(now - last) / 1e6;
    if (gap > maxGap) maxGap = gap;
    last = now;
  }
  assert.ok(maxGap < 12, `paused for ${maxGap.toFixed(0)} ms`);
});
