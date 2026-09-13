import type { CellValue, XlsxApi, XlsxWorkbook } from "./types.ts";
import { assertSheetNames, assertTableLimits, DATA_LIMITS, dataLimitError } from "./limits.ts";

export function requireXlsx(candidate: XlsxApi | undefined): XlsxApi {
  if (!candidate) throw new Error("Excel support is unavailable. Reload the page and try again.");
  return candidate;
}

export function readWorkbook(api: XlsxApi, buffer: ArrayBuffer): XlsxWorkbook {
  const workbook = api.read(buffer, {
    type: "array",
    cellDates: true,
    dense: true,
    sheetRows: DATA_LIMITS.maxRows + 1
  });
  if (!workbook.SheetNames.length) throw new Error("This Excel file has no worksheets.");
  assertSheetNames(workbook.SheetNames);
  return workbook;
}

export function sheetRows(api: XlsxApi, workbook: XlsxWorkbook, sheetName: string): CellValue[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet “${sheetName}” could not be found.`);
  const range = typeof sheet === "object" && sheet !== null && "!ref" in sheet
    ? (sheet as { "!ref"?: unknown })["!ref"]
    : undefined;
  if (typeof range === "string") {
    const decoded = api.utils.decode_range(range);
    const rows = decoded.e.r - decoded.s.r + 1;
    const columns = decoded.e.c - decoded.s.c + 1;
    if (rows > DATA_LIMITS.maxRows) {
      throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxRows.toLocaleString("en-US")} rows.`);
    }
    if (columns > DATA_LIMITS.maxColumns) {
      throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxColumns.toLocaleString("en-US")} columns.`);
    }
    if (rows * columns > DATA_LIMITS.maxCells) {
      throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxCells.toLocaleString("en-US")} cells.`);
    }
  }
  const rows = api.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  assertTableLimits(rows);
  return rows;
}

export function writeWorkbook(api: XlsxApi, rows: string[][]): ArrayBuffer {
  assertTableLimits(rows);
  const workbook = api.utils.book_new();
  const sheet = api.utils.aoa_to_sheet(rows);
  api.utils.book_append_sheet(workbook, sheet, "Cleaned data");
  const result = api.write(workbook, { bookType: "xlsx", type: "array" });
  if (result instanceof ArrayBuffer || Object.prototype.toString.call(result) === "[object ArrayBuffer]") {
    return (result as ArrayBuffer).slice(0);
  }
  if (ArrayBuffer.isView(result)) {
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
  }
  throw new Error("The Excel export returned an unsupported binary format.");
}
