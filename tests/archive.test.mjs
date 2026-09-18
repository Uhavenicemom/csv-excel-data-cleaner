import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadVendoredJsZip() {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    setImmediate,
    clearImmediate,
    setTimeout,
    clearTimeout,
    Uint8Array,
    ArrayBuffer,
    Blob,
    TextEncoder,
    TextDecoder
  };
  context.window = context;
  context.global = context;
  context.self = context;
  vm.runInNewContext(fs.readFileSync(new URL("../vendor/jszip.min.js", import.meta.url), "utf8"), context, {
    filename: "vendor/jszip.min.js"
  });
  return module.exports;
}

test("vendored JSZip creates a valid ZIP archive", async () => {
  const JSZip = loadVendoredJsZip();
  assert.equal(typeof JSZip, "function");
  const archive = new JSZip();
  archive.file("cleanup_report.csv", "File,Status\r\nsample.csv,ready");
  const output = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  assert.equal(output[0], 0x50);
  assert.equal(output[1], 0x4b);
  assert.ok(output.length > 30);
});
