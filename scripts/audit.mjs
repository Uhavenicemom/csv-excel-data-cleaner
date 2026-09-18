import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat();
}

const sourcePaths = (await filesUnder(path.join(root, "src"))).filter((file) => file.endsWith(".ts"));
const [html, sourceParts, styles, app, worker, vendor, jszip, packageJson, pnpmWorkspace] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  Promise.all(sourcePaths.map((file) => readFile(file, "utf8"))),
  readFile(path.join(root, "styles.css"), "utf8"),
  readFile(path.join(root, "app.js"), "utf8"),
  readFile(path.join(root, "xlsx-worker.js"), "utf8"),
  readFile(path.join(root, "vendor/xlsx.full.min.js"), "utf8"),
  readFile(path.join(root, "vendor/jszip.min.js"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8"),
  readFile(path.join(root, "pnpm-workspace.yaml"), "utf8")
]);
const source = sourceParts.join("\n");

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
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) failures.push("Inline executable script bypasses the static content policy.");
if (!/Content-Security-Policy/i.test(html) || !/connect-src 'none'/.test(html)) failures.push("The static content security policy is missing or incomplete.");
if (/script-src[^;]*'unsafe-inline'/.test(html)) failures.push("Inline JavaScript is allowed by the content security policy.");
if (!/style-src-elem 'self' file:/.test(html) || !/style-src-attr 'unsafe-inline'/.test(html)) failures.push("The content policy does not separate trusted stylesheets from virtual-table size attributes.");
if (/innerHTML|outerHTML|insertAdjacentHTML/.test(source)) failures.push("Unsafe HTML injection API found in the application source.");
if (/No file uploaded|>Ready</.test(html + source)) failures.push("A stale status label is still present.");
if (/src="vendor\/xlsx\.full\.min\.js"/.test(html)) failures.push("The Excel library is still loaded before it is needed.");
if (!/<div class="table-scroll"[^>]+role="region"[^>]+tabindex="0"/i.test(html)) failures.push("Scrollable tables are not keyboard-focusable regions.");
if (!/"typecheck"\s*:\s*"tsc --noEmit"/.test(packageJson)) failures.push("The typecheck command does not run the TypeScript compiler.");
if (/"pnpm"\s*:/.test(packageJson)) failures.push("pnpm settings must live in pnpm-workspace.yaml, not package.json.");
if (!/^allowBuilds:\s*\r?\n\s+esbuild:\s*true\s*$/m.test(pnpmWorkspace)) failures.push("The pnpm build-script allowlist is missing or broader than esbuild.");
if (!/maxCells:\s*2_000_000/.test(source)) failures.push("The structural table limits are missing.");
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
if (!/^\/\*!\s+JSZip v3\.10\.1/m.test(jszip)) failures.push("The local ZIP library is missing or has an unexpected version.");
const jszipHash = createHash("sha256").update(jszip).digest("hex").toUpperCase();
if (jszipHash !== "ACC7E41455A80765B5FD9C7EE1B8078A6D160BBBCA455AEAE854DE65C947D59E") {
  failures.push("The local ZIP library checksum does not match the reviewed copy.");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Audit passed: ${ids.length} IDs, ${requiredIds.length} required controls, no stale or remote runtime elements.`);
}
