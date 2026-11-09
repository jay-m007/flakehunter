// Moves the process clock by FH_CLOCK_OFFSET_MS (the clock keeps running). Only the global Date is shifted.
"use strict";
const off = Number(process.env.FH_CLOCK_OFFSET_MS || 0);
if (off) {
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + off); else super(...a); }
    static now() { return RealDate.now() + off; }
  }
  globalThis.Date = ShiftedDate;
}
