import type { CellValue } from "./types.ts";
import { cellToString } from "./value.ts";

export interface TabularLimits {
  maxRows: number;
  maxColumns: number;
  maxCells: number;
  maxCellCharacters: number;
  maxSheets: number;
}

export const DATA_LIMITS: TabularLimits = {
  maxRows: 200_000,
  maxColumns: 256,
  maxCells: 2_000_000,
  maxCellCharacters: 100_000,
  maxSheets: 50
};

export function dataLimitError(detail: string): Error {
  return new Error(`${detail} Try a smaller or narrower table.`);
}

export function assertCellLength(value: CellValue, limits: TabularLimits = DATA_LIMITS): void {
  if (cellToString(value).length > limits.maxCellCharacters) {
    throw dataLimitError(`A cell contains more than ${limits.maxCellCharacters.toLocaleString("en-US")} characters.`);
  }
}

export function assertSheetNames(sheetNames: readonly string[], limits: TabularLimits = DATA_LIMITS): void {
  if (sheetNames.length > limits.maxSheets) {
    throw dataLimitError(`This workbook contains more than ${limits.maxSheets.toLocaleString("en-US")} worksheets.`);
  }
}

export function assertTableLimits(
  rows: readonly (readonly CellValue[])[],
  limits: TabularLimits = DATA_LIMITS
): void {
  if (rows.length > limits.maxRows) {
    throw dataLimitError(`This table contains more than ${limits.maxRows.toLocaleString("en-US")} rows.`);
  }

  let cells = 0;
  for (const row of rows) {
    if (row.length > limits.maxColumns) {
      throw dataLimitError(`This table contains more than ${limits.maxColumns.toLocaleString("en-US")} columns.`);
    }
    cells += row.length;
    if (cells > limits.maxCells) {
      throw dataLimitError(`This table contains more than ${limits.maxCells.toLocaleString("en-US")} cells.`);
    }
    row.forEach((value) => assertCellLength(value, limits));
  }
}
