import type { CellValue } from "./types.ts";

export function isValidDateObject(value: CellValue): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (isValidDateObject(value)) {
    const year = String(value.getFullYear()).padStart(4, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value);
}

export function isBlankRow(row: readonly CellValue[]): boolean {
  return row.every((cell) => cellToString(cell).trim() === "");
}

export function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong while processing this file.";
}
