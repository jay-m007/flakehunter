// Helpers for the planted-flake fixture. Not a test file.
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const run = process.env.FLAKEHUNTER_RUN || "manual";
const dir = path.join(os.tmpdir(), `fh-planted-${process.env.FLAKEHUNTER_SESSION || "manual"}-${run}`);
fs.mkdirSync(dir, { recursive: true });
module.exports = { run, dir, file: (n) => path.join(dir, n) };
