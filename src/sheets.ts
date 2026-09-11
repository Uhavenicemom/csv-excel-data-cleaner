import type { CellValue, HeaderCandidate, PreparedSheet } from "./types.ts";
import { cellToString } from "./value.ts";

export const HEADER_SCAN_LIMIT = 20;

export function uniqueHeaders(headerRow: readonly CellValue[]): { headers: string[]; generated: number } {
  const seen = new Map<string, number>();
  let generated = 0;
  const headers = headerRow.map((value, index) => {
    const supplied = cellToString(value).trim();
    const base = supplied || `Column ${index + 1}`;
    if (!supplied) generated += 1;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return occurrence === 1 ? base : `${base} (${occurrence})`;
  });
  return { headers, generated };
}

export function prepareSheet(rawRows: readonly (readonly CellValue[])[], headerIndex: number): PreparedSheet {
  const selectedHeader = rawRows[headerIndex];
  if (!selectedHeader) throw new Error("Choose a valid header row.");
  const dataRows = rawRows.slice(headerIndex + 1);
  const width = Math.max(selectedHeader.length, ...dataRows.map((row) => row.length));
  if (width === 0) throw new Error("This worksheet does not contain any columns.");
  const paddedHeader = Array.from({ length: width }, (_, index) => selectedHeader[index] ?? "");
  const { headers, generated } = uniqueHeaders(paddedHeader);
  const rows = dataRows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  return { headers, rows, generatedHeaderCount: generated };
}

export function rowPreview(row: readonly CellValue[]): string {
  return row.map(cellToString).map((value) => value.trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 54) || "Empty row";
}

export function headerCandidates(rawRows: readonly (readonly CellValue[])[]): HeaderCandidate[] {
  return rawRows.slice(0, HEADER_SCAN_LIMIT).map((row, index) => ({
    index,
    nonEmpty: row.filter((cell) => cellToString(cell).trim()).length,
    preview: rowPreview(row)
  })).filter((candidate) => candidate.nonEmpty > 0);
}

export function findHeaderRow(rawRows: readonly (readonly CellValue[])[]): number {
  const candidates = headerCandidates(rawRows);
  if (!candidates.length) throw new Error("This worksheet is empty.");
  return candidates[0]?.index ?? 0;
}

export function hasXlsxSignature(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && (
    (bytes[2] === 0x03 && bytes[3] === 0x04)
    || (bytes[2] === 0x05 && bytes[3] === 0x06)
    || (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}
