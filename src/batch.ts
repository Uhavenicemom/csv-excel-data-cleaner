import { serializeCsv } from "./csv.ts";
import type { BatchOutputMode, CleaningSummary, OutputFormat } from "./types.ts";

export const MAX_BATCH_FILES = 10;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_BATCH_CELLS = 2_000_000;

export type BatchStatus = "queued" | "processing" | "ready" | "needs-review" | "failed" | "cancelled";

export interface BatchFileLike {
  name: string;
  size: number;
}

export interface BatchReportEntry {
  filename: string;
  status: BatchStatus;
  sourceRows: number;
  outputRows: number;
  summary: CleaningSummary | null;
  reviewReasons: readonly string[];
  approvedAsIs: boolean;
  includedInZip: boolean;
}

export function validateBatchSelection(files: readonly BatchFileLike[], perFileLimit: number): void {
  if (files.length < 2) throw new Error("Choose at least two files for batch processing.");
  if (files.length > MAX_BATCH_FILES) throw new Error(`Choose no more than ${MAX_BATCH_FILES} files at once.`);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_BATCH_BYTES) throw new Error("The selected files are larger than the 100 MB batch limit.");
  const oversized = files.find((file) => file.size > perFileLimit);
  if (oversized) throw new Error(`${oversized.name} is larger than the per-file limit for this mode.`);
}

export function batchOutputFormat(mode: BatchOutputMode, filename: string): OutputFormat {
  if (mode !== "original") return mode;
  return filename.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
}

export function uniqueArchiveName(filename: string, used: Set<string>): string {
  const match = /^(.*?)(\.[^.]+)?$/.exec(filename);
  const base = match?.[1] || "cleaned-data";
  const extension = match?.[2] || "";
  let candidate = `${base}${extension}`;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}${extension}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function cleanupReportCsv(entries: readonly BatchReportEntry[]): string {
  const rows = entries.map((entry) => [
    entry.filename,
    entry.status,
    String(entry.sourceRows),
    String(entry.outputRows),
    String(entry.summary?.changedRows ?? 0),
    String(entry.summary?.emptyRows ?? 0),
    String(entry.summary?.duplicateRows ?? 0),
    String(entry.summary?.normalizedDates ?? 0),
    String((entry.summary?.invalidEmails ?? 0) + (entry.summary?.possibleEmailTypos ?? 0) + (entry.summary?.invalidDates ?? 0)),
    entry.reviewReasons.join("; "),
    entry.approvedAsIs ? "Yes" : "No",
    entry.includedInZip ? "Yes" : "No"
  ]);
  return serializeCsv([[
    "File", "Status", "Source rows", "Output rows", "Rows changed", "Blank rows removed",
    "Duplicate rows removed", "Dates normalized", "Values to review", "Review notes", "Approved as is", "Included in ZIP"
  ], ...rows]);
}
