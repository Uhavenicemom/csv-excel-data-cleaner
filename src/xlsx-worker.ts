import { csvToRows, decodeUtf8, serializeCsv } from "./csv.ts";
import { hasXlsxSignature } from "./sheets.ts";
import { assertTableLimits } from "./limits.ts";
import type { OutputFormat, WorkerRequest, WorkerResponse, XlsxApi, XlsxWorkbook } from "./types.ts";
import { normalizeError } from "./value.ts";
import { readWorkbook, requireXlsx, sheetRows, writeWorkbook } from "./xlsx.ts";

interface WorkerScope {
  XLSX?: XlsxApi;
  location: Location;
  importScripts(...urls: string[]): void;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
let workbook: XlsxWorkbook | null = null;
let api: XlsxApi | null = null;

function ensureXlsx(): XlsxApi {
  if (api) return api;
  if (!scope.XLSX) {
    scope.importScripts(new URL("vendor/xlsx.full.min.js", scope.location.href).href);
  }
  api = requireXlsx(scope.XLSX);
  return api;
}

function send(response: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer);
}

function exportRows(
  format: OutputFormat,
  rows: string[][],
  quoteAll: boolean
): { buffer: ArrayBuffer; mime: string; extension: OutputFormat } {
  assertTableLimits(rows);
  if (format === "xlsx") {
    return {
      buffer: writeWorkbook(ensureXlsx(), rows),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx"
    };
  }
  return {
    buffer: new TextEncoder().encode(`\uFEFF${serializeCsv(rows, quoteAll)}`).buffer as ArrayBuffer,
    mime: "text/csv;charset=utf-8",
    extension: "csv"
  };
}

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.type === "parse") {
      if (request.fileType === "csv") {
        workbook = null;
        send({ id: request.id, ok: true, type: "parse", rows: csvToRows(decodeUtf8(request.buffer)), sheetNames: [], activeSheet: null });
        return;
      }
      if (!hasXlsxSignature(request.buffer)) throw new Error("This file does not appear to be a valid .xlsx workbook.");
      const xlsx = ensureXlsx();
      workbook = readWorkbook(xlsx, request.buffer);
      const activeSheet = workbook.SheetNames[0];
      if (!activeSheet) throw new Error("This Excel file has no worksheets.");
      send({
        id: request.id,
        ok: true,
        type: "parse",
        rows: sheetRows(xlsx, workbook, activeSheet),
        sheetNames: [...workbook.SheetNames],
        activeSheet
      });
      return;
    }

    if (request.type === "sheet") {
      if (!workbook) throw new Error("Choose an Excel file before changing worksheets.");
      send({ id: request.id, ok: true, type: "sheet", rows: sheetRows(ensureXlsx(), workbook, request.sheetName), sheetName: request.sheetName });
      return;
    }

    const result = exportRows(request.format, request.rows, request.quoteAll);
    send({ id: request.id, ok: true, type: "export", ...result }, [result.buffer]);
  } catch (error) {
    send({ id: request.id, ok: false, error: normalizeError(error) });
  }
};
