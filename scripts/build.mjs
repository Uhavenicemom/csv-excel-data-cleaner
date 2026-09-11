import { readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const entries = [
  ["src/main.ts", "app.js"],
  ["src/xlsx-worker.ts", "xlsx-worker.js"]
];

const IMPORT_PATTERN = /import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["'](.+?)["'];?/g;
const RUNTIME_EXPORT_PATTERN = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

function runtimeSpecifiers(specifiers) {
  return specifiers
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("type "))
    .map((part) => {
      const [imported, local = imported] = part.split(/\s+as\s+/);
      return imported === local ? imported : `${imported}: ${local}`;
    });
}

async function bundle(entryRelativePath) {
  const modules = new Map();
  const order = [];

  async function collect(filePath) {
    const absolutePath = path.resolve(root, filePath);
    if (modules.has(absolutePath)) return;
    const source = await readFile(absolutePath, "utf8");
    const imports = [];
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const typeOnly = Boolean(match[1]);
      const resolved = path.resolve(path.dirname(absolutePath), match[3]);
      const names = typeOnly ? [] : runtimeSpecifiers(match[2]);
      imports.push({ resolved, names });
      if (!typeOnly) await collect(resolved);
    }
    const exports = [...source.matchAll(RUNTIME_EXPORT_PATTERN)].map((match) => match[1]);
    modules.set(absolutePath, { source, imports, exports });
    order.push(absolutePath);
  }

  await collect(entryRelativePath);
  const ids = new Map(order.map((filePath, index) => [filePath, `__module${index}`]));
  const chunks = ["(() => {", '"use strict";'];

  for (const filePath of order) {
    const module = modules.get(filePath);
    const moduleId = ids.get(filePath);
    const imports = module.imports
      .filter(({ names }) => names.length > 0)
      .map(({ resolved, names }) => `const { ${names.join(", ")} } = ${ids.get(resolved)};`)
      .join("\n");
    let code = stripTypeScriptTypes(module.source, { mode: "transform", sourceMap: false });
    code = code
      .replace(IMPORT_PATTERN, "")
      .replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g, "")
      .replace(/^\s*export\s*\{[\s\S]*?\};?\s*$/gm, "")
      .trim();
    const returned = module.exports.length ? `{ ${module.exports.join(", ")} }` : "{}";
    chunks.push(`const ${moduleId} = (() => {\n${imports}\n${code}\nreturn ${returned};\n})();`);
  }

  chunks.push("})();", "");
  const output = chunks.join("\n");
  new vm.Script(output, { filename: entryRelativePath });
  return output;
}

for (const [entry, destination] of entries) {
  const output = await bundle(entry);
  if (!checkOnly) await writeFile(path.join(root, destination), output, "utf8");
  console.log(`${checkOnly ? "Checked" : "Built"} ${destination}`);
}
