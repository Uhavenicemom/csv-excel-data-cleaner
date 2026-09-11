import { csvToRows, decodeUtf8, serializeCsv } from "./csv.ts";
import { hasXlsxSignature } from "./sheets.ts";
import type {
  CellValue,
  ExportedFile,
  OutputFormat,
  ParsedFile,
  WorkerRequest,
  WorkerResponse,
  XlsxApi,
  XlsxWorkbook
} from "./types.ts";
import { normalizeError } from "./value.ts";
import { readWorkbook, requireXlsx, sheetRows, writeWorkbook } from "./xlsx.ts";

declare global {
  interface Window {
    XLSX?: XlsxApi;
  }
}

type WorkerRequestBody =
  | Omit<Extract<WorkerRequest, { type: "parse" }>, "id">
  | Omit<Extract<WorkerRequest, { type: "sheet" }>, "id">
  | Omit<Extract<WorkerRequest, { type: "export" }>, "id">;

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timer: number;
}

export const HOSTED_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
export const LOCAL_FILE_LIMIT_BYTES = 10 * 1024 * 1024;

export class FileProcessor {
  private worker: Worker | null = null;
  private directWorkbook: XlsxWorkbook | null = null;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();

  get supportsBackgroundProcessing(): boolean {
    return window.location.protocol !== "file:" && "Worker" in window;
  }

  private destroyWorker(error?: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ reject, timer }) => {
      window.clearTimeout(timer);
      if (error) reject(error);
    });
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker("xlsx-worker.js?v=1");
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      window.clearTimeout(pending.timer);
      if (event.data.ok) pending.resolve(event.data);
      else pending.reject(new Error(event.data.error));
    });
    worker.addEventListener("error", () => {
      this.destroyWorker(new Error("Background processing could not start in this browser."));
    });
    this.worker = worker;
    return worker;
  }

  private callWorker(message: WorkerRequestBody, transfer: Transferable[] = []): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.destroyWorker(new Error("Background processing took too long and was stopped."));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, ...message } as WorkerRequest, transfer);
    });
  }

  private loadDirect(fileType: OutputFormat, buffer: ArrayBuffer): ParsedFile {
    if (fileType === "csv") {
      return { rows: csvToRows(decodeUtf8(buffer)), sheetNames: [], activeSheet: null, usedWorker: false };
    }
    if (!hasXlsxSignature(buffer)) throw new Error("This file does not appear to be a valid .xlsx workbook.");
    const api = requireXlsx(window.XLSX);
    this.directWorkbook = readWorkbook(api, buffer);
    const activeSheet = this.directWorkbook.SheetNames[0] ?? null;
    if (!activeSheet) throw new Error("This Excel file has no worksheets.");
    return {
      rows: sheetRows(api, this.directWorkbook, activeSheet),
      sheetNames: [...this.directWorkbook.SheetNames],
      activeSheet,
      usedWorker: false
    };
  }

  async load(fileType: OutputFormat, buffer: ArrayBuffer): Promise<ParsedFile> {
    this.directWorkbook = null;
    this.destroyWorker();
    if (!this.supportsBackgroundProcessing) return this.loadDirect(fileType, buffer);

    if (fileType === "xlsx" && !hasXlsxSignature(buffer)) {
      throw new Error("This file does not appear to be a valid .xlsx workbook.");
    }
    const fallback = buffer.byteLength <= LOCAL_FILE_LIMIT_BYTES ? buffer.slice(0) : null;
    try {
      const response = await this.callWorker({ type: "parse", fileType, buffer }, [buffer]);
      if (!response.ok || response.type !== "parse") throw new Error("The background processor returned an unexpected response.");
      return { rows: response.rows, sheetNames: response.sheetNames, activeSheet: response.activeSheet, usedWorker: true };
    } catch (error) {
      this.destroyWorker();
      if (fallback) return this.loadDirect(fileType, fallback);
      throw new Error(`${normalizeError(error)} Try a smaller file or reload the page.`);
    }
  }

  async selectSheet(sheetName: string): Promise<CellValue[][]> {
    if (this.worker) {
      const response = await this.callWorker({ type: "sheet", sheetName });
      if (!response.ok || response.type !== "sheet") throw new Error("The worksheet could not be loaded.");
      return response.rows;
    }
    const api = requireXlsx(window.XLSX);
    if (!this.directWorkbook) throw new Error("Choose the Excel file again before changing worksheets.");
    return sheetRows(api, this.directWorkbook, sheetName);
  }

  async exportRows(format: OutputFormat, rows: string[][], quoteAll = false): Promise<ExportedFile> {
    if (this.supportsBackgroundProcessing) {
      try {
        const response = await this.callWorker({ type: "export", format, rows, quoteAll });
        if (!response.ok || response.type !== "export") throw new Error("The exported file could not be prepared.");
        return { buffer: response.buffer, mime: response.mime, extension: response.extension };
      } catch {
        this.destroyWorker();
      }
    }
    if (format === "xlsx") {
      return {
        buffer: writeWorkbook(requireXlsx(window.XLSX), rows),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx"
      };
    }
    const buffer = new TextEncoder().encode(`\uFEFF${serializeCsv(rows, quoteAll)}`).buffer as ArrayBuffer;
    return { buffer, mime: "text/csv;charset=utf-8", extension: "csv" };
  }

  dispose(): void {
    this.destroyWorker();
    this.directWorkbook = null;
  }
}
