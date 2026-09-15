export type CellValue = string | number | boolean | Date | null | undefined;

export type InputDateOrder = "DD-MM-YY" | "MM-DD-YY";
export type OutputDateFormat = InputDateOrder | "YY-MM-DD";
export type OutputFormat = "csv" | "xlsx";

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export type DateParseResult =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "valid"; value: string; parts: DateParts };

export interface CleaningSettings {
  removeEmpty: boolean;
  trimWhitespace: boolean;
  deduplicate: boolean;
  dedupColumn: string;
  validateEmail: boolean;
  emailColumn: string;
  normalizeDates: boolean;
  dateColumn: string;
  inputDateOrder: InputDateOrder;
  dateFormat: OutputDateFormat;
}

export interface RowIssues {
  [columnIndex: number]: string;
}

export interface CleanedRow {
  values: string[];
  issues: RowIssues;
  changed: boolean;
  sourceIndex: number;
}

export interface CleaningSummary {
  changedRows: number;
  emptyRows: number;
  duplicateRows: number;
  invalidEmails: number;
  possibleEmailTypos: number;
  invalidDates: number;
  normalizedDates: number;
}

export interface Diagnostics {
  duplicateValues: number;
  invalidEmails: number;
  possibleEmailTypos: number;
  invalidDates: number;
}

export interface CleaningResult {
  output: CleanedRow[];
  summary: CleaningSummary;
  diagnostics: Diagnostics;
  preparedRows: string[][];
}

export interface PreparedSheet {
  headers: string[];
  rows: CellValue[][];
  generatedHeaderCount: number;
}

export interface HeaderCandidate {
  index: number;
  nonEmpty: number;
  preview: string;
}

export interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

export interface XlsxApi {
  read(data: ArrayBuffer | Uint8Array, options?: Record<string, unknown>): XlsxWorkbook;
  utils: {
    sheet_to_json(sheet: unknown, options?: Record<string, unknown>): CellValue[][];
    decode_range(range: string): { s: { r: number; c: number }; e: { r: number; c: number } };
    book_new(): XlsxWorkbook;
    aoa_to_sheet(rows: string[][]): unknown;
    book_append_sheet(workbook: XlsxWorkbook, sheet: unknown, name: string): void;
  };
  write(workbook: XlsxWorkbook, options: Record<string, unknown>): ArrayBuffer | Uint8Array;
}

export interface ParsedFile {
  rows: CellValue[][];
  sheetNames: string[];
  activeSheet: string | null;
  usedWorker: boolean;
}

export interface ExportedFile {
  buffer: ArrayBuffer;
  mime: string;
  extension: OutputFormat;
}

export type WorkerRequest =
  | { id: number; type: "parse"; fileType: OutputFormat; buffer: ArrayBuffer }
  | { id: number; type: "sheet"; sheetName: string }
  | { id: number; type: "export"; format: OutputFormat; rows: string[][]; quoteAll: boolean };

export type WorkerResponse =
  | { id: number; ok: true; type: "parse"; rows: CellValue[][]; sheetNames: string[]; activeSheet: string | null }
  | { id: number; ok: true; type: "sheet"; rows: CellValue[][]; sheetName: string }
  | { id: number; ok: true; type: "export"; buffer: ArrayBuffer; mime: string; extension: OutputFormat }
  | { id: number; ok: false; error: string };
