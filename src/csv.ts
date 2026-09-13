import type { CellValue } from "./types.ts";
import { DATA_LIMITS, dataLimitError, type TabularLimits } from "./limits.ts";
import { cellToString } from "./value.ts";

const DELIMITERS = [",", ";", "\t"] as const;

export function decodeUtf8(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("This CSV is not valid UTF-8. Save it as UTF-8 in your spreadsheet app and try again.");
  }
}

export function detectCsvDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let inQuotes = false;
  let lines = 0;
  for (let index = 0; index < text.length && lines < 12; index += 1) {
    const character = text.charAt(index);
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && DELIMITERS.includes(character as (typeof DELIMITERS)[number])) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    } else if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      lines += 1;
    }
  }
  return [...counts.entries()].reduce((best, current) => current[1] > best[1] ? current : best, [",", 0] as [string, number])[0];
}

export function csvToRows(text: string, limits: TabularLimits = DATA_LIMITS): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellCount = 0;

  const pushCell = (): void => {
    if (cell.length > limits.maxCellCharacters) {
      throw dataLimitError(`A cell contains more than ${limits.maxCellCharacters.toLocaleString("en-US")} characters.`);
    }
    if (row.length >= limits.maxColumns) {
      throw dataLimitError(`This table contains more than ${limits.maxColumns.toLocaleString("en-US")} columns.`);
    }
    cellCount += 1;
    if (cellCount > limits.maxCells) {
      throw dataLimitError(`This table contains more than ${limits.maxCells.toLocaleString("en-US")} cells.`);
    }
    row.push(cell);
    cell = "";
  };

  const pushRow = (): void => {
    if (rows.length >= limits.maxRows) {
      throw dataLimitError(`This table contains more than ${limits.maxRows.toLocaleString("en-US")} rows.`);
    }
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      pushCell();
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      pushCell();
      pushRow();
    } else {
      cell += character ?? "";
      if (cell.length > limits.maxCellCharacters) {
        throw dataLimitError(`A cell contains more than ${limits.maxCellCharacters.toLocaleString("en-US")} characters.`);
      }
    }
  }

  if (inQuotes) throw new Error("This CSV has an unmatched quotation mark. Fix the quotation marks and try again.");
  const hasFinalRow = row.some((value) => value !== "") || cell !== "";
  if (hasFinalRow) {
    pushCell();
    pushRow();
  }
  return rows;
}

export function csvEscape(value: CellValue, forceQuote = false): string {
  const source = cellToString(value);
  return forceQuote || /[",\n\r\t]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}

export function serializeCsv(rows: readonly (readonly CellValue[])[], forceQuote = false): string {
  return rows.map((row) => row.map((value) => csvEscape(value, forceQuote)).join(",")).join("\r\n");
}
