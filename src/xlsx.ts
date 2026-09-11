import type { CellValue, XlsxApi, XlsxWorkbook } from "./types.ts";

export function requireXlsx(candidate: XlsxApi | undefined): XlsxApi {
  if (!candidate) throw new Error("Excel support is unavailable. Reload the page and try again.");
  return candidate;
}

export function readWorkbook(api: XlsxApi, buffer: ArrayBuffer): XlsxWorkbook {
  const workbook = api.read(buffer, { type: "array", cellDates: true, dense: true });
  if (!workbook.SheetNames.length) throw new Error("This Excel file has no worksheets.");
  return workbook;
}

export function sheetRows(api: XlsxApi, workbook: XlsxWorkbook, sheetName: string): CellValue[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet “${sheetName}” could not be found.`);
  return api.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
}

export function writeWorkbook(api: XlsxApi, rows: string[][]): ArrayBuffer {
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
