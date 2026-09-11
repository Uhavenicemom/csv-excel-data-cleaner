import type { CellValue } from "./types.ts";
import { cellToString } from "./value.ts";

const FORMULA_PREFIX = /^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u;

export function isFormulaLike(value: CellValue): boolean {
  return FORMULA_PREFIX.test(cellToString(value));
}

export function dangerousFormulaCount(rows: readonly (readonly CellValue[])[]): number {
  return rows.reduce((total, row) => total + row.filter(isFormulaLike).length, 0);
}

export function makeSpreadsheetSafe(value: CellValue): string {
  const source = cellToString(value);
  return isFormulaLike(source) ? `'${source}` : source;
}

export function safeRows(rows: readonly (readonly CellValue[])[]): string[][] {
  return rows.map((row) => row.map(makeSpreadsheetSafe));
}
