import type { CellValue, DateParseResult, DateParts, InputDateOrder, OutputDateFormat } from "./types.ts";
import { cellToString, isValidDateObject } from "./value.ts";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

export function isValidDateParts({ year, month, day }: DateParts): boolean {
  if (![year, month, day].every(Number.isInteger)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatDate(parts: DateParts, format: OutputDateFormat): string {
  const year = String(parts.year % 100).padStart(2, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  if (format === "MM-DD-YY") return `${month}-${day}-${year}`;
  if (format === "YY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}-${month}-${year}`;
}

function validResult(parts: DateParts, format: OutputDateFormat): DateParseResult {
  return isValidDateParts(parts)
    ? { status: "valid", value: formatDate(parts, format), parts }
    : { status: "invalid" };
}

function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function parseNumericDate(source: string, format: OutputDateFormat, inputOrder: InputDateOrder): DateParseResult | null {
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(source)) {
    const [year, month, day] = source.split(/[/-]/).map(Number);
    if (year === undefined || month === undefined || day === undefined) return { status: "invalid" };
    return validResult({ year, month, day }, format);
  }

  if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(source)) return null;
  const [first, second, rawYear] = source.split(/[/-]/).map(Number);
  if (first === undefined || second === undefined || rawYear === undefined) return { status: "invalid" };
  const order = first > 12 && second <= 12
    ? "DD-MM-YY"
    : second > 12 && first <= 12
      ? "MM-DD-YY"
      : inputOrder;
  const [month, day] = order === "MM-DD-YY" ? [first, second] : [second, first];
  return validResult({ year: expandYear(rawYear), month, day }, format);
}

function parseTextDate(source: string, format: OutputDateFormat): DateParseResult {
  const monthFirst = source.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/i);
  const dayFirst = source.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?[,]?\s+(\d{4})$/i);
  const monthName = monthFirst?.[1] ?? dayFirst?.[2];
  const month = monthName ? MONTHS[monthName.toLowerCase()] : undefined;
  const day = Number(monthFirst?.[2] ?? dayFirst?.[1]);
  const year = Number(monthFirst?.[3] ?? dayFirst?.[3]);
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return { status: "invalid" };
  return validResult({ year, month, day }, format);
}

export function parseDate(value: CellValue, outputFormat: OutputDateFormat, inputOrder: InputDateOrder): DateParseResult {
  if (isValidDateObject(value)) {
    return validResult({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }, outputFormat);
  }
  const source = cellToString(value).trim();
  if (!source) return { status: "empty" };
  return parseNumericDate(source, outputFormat, inputOrder) ?? parseTextDate(source, outputFormat);
}
