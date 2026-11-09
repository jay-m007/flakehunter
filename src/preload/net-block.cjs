// Makes every connection to a non-loopback host fail, so tests that quietly depend on the network show up.
"use strict";
const net = require("net");
const dns = require("dns");
const local = (h) => !h || h === "localhost" || h.endsWith(".localhost") || /^127\./.test(h) || h === "::1" || h === "::" || h === "0.0.0.0" || h === "::ffff:127.0.0.1";
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let host;
  let a = args[0];
  if (Array.isArray(a)) a = a[0]; // net.connect() hands over already-normalised arguments: [options, callback]
  if (a && typeof a === "object") host = a.path ? "" : a.host;
  else if (typeof a === "number" || (typeof a === "string" && /^\d+$/.test(a))) host = typeof args[1] === "string" ? args[1] : "localhost";
  else host = ""; // unix socket path
  if (host !== undefined && !local(host)) {
    const err = Object.assign(new Error(`connect ENETUNREACH ${host} (network blocked by flakehunter)`), { code: "ENETUNREACH", syscall: "connect", address: host });
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return origConnect.apply(this, args);
};
const origLookup = dns.lookup;
dns.lookup = function (hostname, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  if (!local(hostname) && !/^[\d.:a-f]+$/i.test(String(hostname))) {
    const err = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname} (network blocked by flakehunter)`), { code: "ENOTFOUND", syscall: "getaddrinfo", hostname });
    return process.nextTick(cb, err);
  }
  return origLookup.call(dns, hostname, options, cb);
};
const origPromiseLookup = dns.promises.lookup;
dns.promises.lookup = async function (hostname, options) {
  if (!local(hostname) && !/^[\d.:a-f]+$/i.test(String(hostname))) {
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname} (network blocked by flakehunter)`), { code: "ENOTFOUND", syscall: "getaddrinfo", hostname });
  }
  return origPromiseLookup.call(dns.promises, hostname, options);
};
