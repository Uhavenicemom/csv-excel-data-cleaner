import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { readWorkbook, sheetRows, writeWorkbook } from "../src/xlsx.ts";

async function loadXlsx() {
  const source = await readFile(new URL("../vendor/xlsx.full.min.js", import.meta.url), "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "xlsx.full.min.js" });
  return context.XLSX;
}

test("reads and writes XLSX table data with dates", async () => {
  const api = await loadXlsx();
  const sourceRows = [["Name", "Date"], ["Ada", "2025-01-04"]];
  const exported = writeWorkbook(api, sourceRows);
  const workbook = readWorkbook(api, exported);
  assert.deepEqual(JSON.parse(JSON.stringify(sheetRows(api, workbook, "Cleaned data"))), sourceRows);
});
