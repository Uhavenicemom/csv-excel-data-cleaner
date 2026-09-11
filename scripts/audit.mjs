import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const [html, source, styles, app, worker, vendor] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "src/main.ts"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
  readFile(path.join(root, "app.js"), "utf8"),
  readFile(path.join(root, "xlsx-worker.js"), "utf8"),
  readFile(path.join(root, "vendor/xlsx.full.min.js"), "utf8")
]);

const failures = [];
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
const requiredIds = [...source.matchAll(/required<[^>]+>\("#([^"]+)"\)/g)].map((match) => match[1]);
const missingRequiredIds = requiredIds.filter((id) => !ids.includes(id));
const buttonsWithoutType = [...html.matchAll(/<button\b[^>]*>/g)].filter((match) => !/\btype="button"|\btype="submit"/.test(match[0]));

if (duplicateIds.length) failures.push(`Duplicate HTML IDs: ${duplicateIds.join(", ")}`);
if (missingRequiredIds.length) failures.push(`Missing required elements: ${missingRequiredIds.join(", ")}`);
if (buttonsWithoutType.length) failures.push(`${buttonsWithoutType.length} button(s) have no explicit type.`);
if (/<script[^>]+src="https?:/i.test(html)) failures.push("A runtime script still depends on an external CDN.");
if (/innerHTML|outerHTML|insertAdjacentHTML/.test(source)) failures.push("Unsafe HTML injection API found in the application source.");
if (/No file uploaded|>Ready</.test(html + source)) failures.push("A stale status label is still present.");
if (!/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(styles)) failures.push("The hidden-state CSS guard is missing.");
if (!app.includes("initialize();")) failures.push("The generated app bundle does not initialize.");
if (!worker.includes("scope.onmessage")) failures.push("The generated worker bundle has no message handler.");
if (!vendor.startsWith("/*! xlsx.js")) failures.push("The local Excel library is missing its upstream license header.");
if (!vendor.includes('version="0.20.3"') && !vendor.includes('version:"0.20.3"')) failures.push("The local Excel library is not SheetJS 0.20.3.");
if ((await stat(path.join(root, "vendor/xlsx.full.min.js"))).size < 500_000) failures.push("The local Excel library looks incomplete.");
const vendorHash = createHash("sha256").update(vendor).digest("hex").toUpperCase();
if (vendorHash !== "B315047C382F0F4033305AD72F2204747DAEF391784EE6138289EFC0831B63D0") {
  failures.push("The local Excel library checksum does not match the reviewed copy.");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Audit passed: ${ids.length} IDs, ${requiredIds.length} required controls, no stale or remote runtime elements.`);
}
