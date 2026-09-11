import { parseDate } from "./dates.ts";
import type {
  CellValue,
  CleanedRow,
  CleaningResult,
  CleaningSettings,
  Diagnostics,
  RowIssues
} from "./types.ts";
import { cellToString, isBlankRow, isValidDateObject } from "./value.ts";

export function isEmail(value: CellValue): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(cellToString(value).trim());
}

function editedValue(
  original: CellValue,
  sourceIndex: number,
  columnIndex: number,
  manualEdits: ReadonlyMap<string, string>
): string {
  return manualEdits.get(`${sourceIndex}:${columnIndex}`) ?? cellToString(original);
}

function prepareRows(
  rows: readonly (readonly CellValue[])[],
  settings: CleaningSettings,
  manualEdits: ReadonlyMap<string, string>
): { values: string[]; sourceIndex: number; changed: boolean }[] {
  return rows.map((original, sourceIndex) => {
    const values = original.map((value, columnIndex) => editedValue(value, sourceIndex, columnIndex, manualEdits));
    let changed = original.some((value) => isValidDateObject(value));
    if (settings.trimWhitespace) {
      values.forEach((value, index) => {
        const trimmed = value.trim();
        if (trimmed !== value) {
          values[index] = trimmed;
          changed = true;
        }
      });
    }
    for (let index = 0; index < values.length; index += 1) {
      if (manualEdits.has(`${sourceIndex}:${index}`) && values[index] !== cellToString(original[index])) changed = true;
    }
    return { values, sourceIndex, changed };
  });
}

function duplicateCount(rows: readonly (readonly string[])[], columnIndex: number): number {
  if (columnIndex < 0) return 0;
  const seen = new Set<string>();
  let duplicates = 0;
  rows.forEach((row) => {
    const key = (row[columnIndex] ?? "").trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  });
  return duplicates;
}

function diagnoseRows(headers: readonly string[], rows: readonly (readonly string[])[], settings: CleaningSettings): Diagnostics {
  const dedupIndex = headers.indexOf(settings.dedupColumn);
  const emailIndex = headers.indexOf(settings.emailColumn);
  const dateIndex = headers.indexOf(settings.dateColumn);
  return {
    duplicateValues: duplicateCount(rows, dedupIndex),
    invalidEmails: emailIndex < 0 ? 0 : rows.filter((row) => {
      const value = (row[emailIndex] ?? "").trim();
      return Boolean(value) && !isEmail(value);
    }).length,
    invalidDates: dateIndex < 0 ? 0 : rows.filter((row) => {
      const value = (row[dateIndex] ?? "").trim();
      return Boolean(value) && parseDate(value, settings.dateFormat, settings.inputDateOrder).status === "invalid";
    }).length
  };
}

function validateAndNormalize(
  values: string[],
  headers: readonly string[],
  settings: CleaningSettings
): { values: string[]; issues: RowIssues; changed: boolean; normalizedDate: boolean } {
  const next = [...values];
  const issues: RowIssues = {};
  let changed = false;
  let normalizedDate = false;
  const emailIndex = headers.indexOf(settings.emailColumn);
  const dateIndex = headers.indexOf(settings.dateColumn);

  if (settings.validateEmail && emailIndex >= 0) {
    const email = (next[emailIndex] ?? "").trim();
    if (email && !isEmail(email)) issues[emailIndex] = "Invalid email";
  }

  if (settings.normalizeDates && dateIndex >= 0) {
    const source = next[dateIndex] ?? "";
    if (source.trim()) {
      const result = parseDate(source, settings.dateFormat, settings.inputDateOrder);
      if (result.status === "valid" && result.value !== source) {
        next[dateIndex] = result.value;
        changed = true;
        normalizedDate = true;
      } else if (result.status === "invalid") {
        issues[dateIndex] = "Invalid date";
      }
    }
  }
  return { values: next, issues, changed, normalizedDate };
}

export function cleanRows(
  headers: readonly string[],
  rows: readonly (readonly CellValue[])[],
  settings: CleaningSettings,
  manualEdits: ReadonlyMap<string, string>
): CleaningResult {
  const prepared = prepareRows(rows, settings, manualEdits);
  const remaining = settings.removeEmpty ? prepared.filter((entry) => !isBlankRow(entry.values)) : prepared;
  const diagnostics = diagnoseRows(headers, remaining.map((entry) => entry.values), settings);
  const summary = {
    changedRows: 0,
    emptyRows: prepared.length - remaining.length,
    duplicateRows: 0,
    invalidEmails: 0,
    invalidDates: 0,
    normalizedDates: 0
  };
  const dedupIndex = headers.indexOf(settings.dedupColumn);
  const seen = new Set<string>();
  const output: CleanedRow[] = [];

  remaining.forEach((entry) => {
    if (settings.deduplicate && dedupIndex >= 0) {
      const key = (entry.values[dedupIndex] ?? "").trim().toLowerCase();
      if (key && seen.has(key)) {
        summary.duplicateRows += 1;
        return;
      }
      if (key) seen.add(key);
    }

    const processed = validateAndNormalize(entry.values, headers, settings);
    const changed = entry.changed || processed.changed;
    if (changed) summary.changedRows += 1;
    if (processed.normalizedDate) summary.normalizedDates += 1;
    summary.invalidEmails += Object.values(processed.issues).filter((issue) => issue === "Invalid email").length;
    summary.invalidDates += Object.values(processed.issues).filter((issue) => issue === "Invalid date").length;
    output.push({ values: processed.values, issues: processed.issues, changed, sourceIndex: entry.sourceIndex });
  });

  return { output, summary, diagnostics, preparedRows: remaining.map((entry) => entry.values) };
}

export function issuesForOriginalRow(
  row: readonly CellValue[],
  headers: readonly string[],
  settings: CleaningSettings
): RowIssues {
  const values = row.map(cellToString);
  return validateAndNormalize(values, headers, settings).issues;
}
