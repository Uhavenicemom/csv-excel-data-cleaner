import { build } from "esbuild";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const entries = [
  ["src/main.ts", "app.js"],
  ["src/xlsx-worker.ts", "xlsx-worker.js"]
];

for (const [entry, destination] of entries) {
  await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: destination,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2022"],
    legalComments: "none",
    sourcemap: false,
    write: !checkOnly,
    logLevel: "silent"
  });
  console.log(`${checkOnly ? "Checked" : "Built"} ${destination}`);
}
