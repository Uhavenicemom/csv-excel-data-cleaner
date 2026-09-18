import { isEmail } from "./cleaning.ts";
import { parseDate } from "./dates.ts";
import type { CellValue, InputDateOrder } from "./types.ts";
import { cellToString } from "./value.ts";

const DATE_HEADER_HINT = /\b(date|day|time|created|updated|due|deadline|start|end|birth|birthday|dob|joined)\b/i;
const EMAIL_HEADER_HINT = /\be-?mail\b/i;
const DEDUP_HEADER_HINT = /\b(e-?mail|id|identifier|code|reference|number)\b/i;

export interface ColumnCandidates {
  date: string[];
  email: string[];
  dedup: string[];
}

function sampleColumn(rows: readonly (readonly CellValue[])[], index: number): string[] {
  return rows.slice(0, 100).map((row) => cellToString(row[index]).trim()).filter(Boolean);
}

function matchingColumns(
  headers: readonly string[],
  rows: readonly (readonly CellValue[])[],
  type: "date" | "email" | "dedup",
  inputDateOrder: InputDateOrder
): string[] {
  return headers.filter((header, index) => {
    const values = sampleColumn(rows, index);
    const headerMatches = type === "date"
      ? DATE_HEADER_HINT.test(header)
      : type === "email"
        ? EMAIL_HEADER_HINT.test(header)
        : DEDUP_HEADER_HINT.test(header);
    if (headerMatches) return true;
    if (values.length < 2) return false;
    if (type === "date") {
      const valid = values.filter((value) => parseDate(value, "YY-MM-DD", inputDateOrder).status === "valid").length;
      return valid / values.length >= 0.7;
    }
    if (type === "email") return values.filter(isEmail).length / values.length >= 0.7;
    return false;
  });
}

export function detectColumnCandidates(
  headers: readonly string[],
  rows: readonly (readonly CellValue[])[],
  inputDateOrder: InputDateOrder
): ColumnCandidates {
  const email = matchingColumns(headers, rows, "email", inputDateOrder);
  const date = matchingColumns(headers, rows, "date", inputDateOrder);
  const dedup = [...new Set([...email, ...matchingColumns(headers, rows, "dedup", inputDateOrder)])];
  return { date, email, dedup };
}
