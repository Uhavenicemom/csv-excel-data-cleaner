import test from "node:test";
import assert from "node:assert/strict";

import { cleanRows } from "../src/cleaning.ts";
import { csvToRows, decodeUtf8, detectCsvDelimiter, serializeCsv } from "../src/csv.ts";
import { parseDate } from "../src/dates.ts";
import { isFormulaLike, makeSpreadsheetSafe } from "../src/security.ts";
import { findHeaderRow, prepareSheet } from "../src/sheets.ts";
import type { CleaningSettings } from "../src/types.ts";
import { cellToString } from "../src/value.ts";

const settings: CleaningSettings = {
  removeEmpty: true,
  trimWhitespace: true,
  deduplicate: false,
  dedupColumn: "Email",
  validateEmail: true,
  emailColumn: "Email",
  normalizeDates: true,
  dateColumn: "Date",
  inputDateOrder: "DD-MM-YY",
  dateFormat: "DD-MM-YY"
};

test("normalizes valid dates and keeps impossible dates for review", () => {
  assert.deepEqual(parseDate("2025/01/04", "MM-DD-YY", "DD-MM-YY"), {
    status: "valid",
    value: "01-04-25",
    parts: { year: 2025, month: 1, day: 4 }
  });
  assert.equal(parseDate("31/02/2025", "DD-MM-YY", "DD-MM-YY").status, "invalid");
  assert.equal(parseDate("01-08-2025", "DD-MM-YY", "MM-DD-YY").status, "valid");
});

test("converts actual spreadsheet Date values without locale-dependent text", () => {
  const value = new Date(2025, 0, 4);
  assert.equal(cellToString(value), "2025-01-04");
  const parsed = parseDate(value, "YY-MM-DD", "DD-MM-YY");
  assert.equal(parsed.status, "valid");
  if (parsed.status === "valid") assert.equal(parsed.value, "25-01-04");
});

test("detects comma, semicolon, and tab-delimited files", () => {
  assert.equal(detectCsvDelimiter("a,b\n1,2"), ",");
  assert.equal(detectCsvDelimiter("a;b\n1;2"), ";");
  assert.equal(detectCsvDelimiter("a\tb\n1\t2"), "\t");
  assert.deepEqual(csvToRows('name,note\n"Ada","hello, world"'), [["name", "note"], ["Ada", "hello, world"]]);
  assert.equal(serializeCsv([["=1+1", "plain"]], true), '"=1+1","plain"');
});

test("rejects malformed UTF-8 instead of silently replacing bytes", () => {
  assert.throws(() => decodeUtf8(new Uint8Array([0xc3, 0x28]).buffer), /UTF-8/);
});

test("preserves cells that extend beyond the selected header row", () => {
  const rawRows = [["Name"], ["Ada", "ada@example.com", "extra"]];
  assert.equal(findHeaderRow(rawRows), 0);
  const sheet = prepareSheet(rawRows, 0);
  assert.deepEqual(sheet.headers, ["Name", "Column 2", "Column 3"]);
  assert.deepEqual(sheet.rows, [["Ada", "ada@example.com", "extra"]]);
  assert.equal(sheet.generatedHeaderCount, 2);
});

test("flags formula-like cells after whitespace and full-width prefixes", () => {
  for (const value of ["=1+1", "\t@SUM(A1)", "\r-2", "  +3", "\u00A0＝cmd"]) {
    assert.equal(isFormulaLike(value), true, value);
    assert.equal(makeSpreadsheetSafe(value).startsWith("'"), true, value);
  }
  assert.equal(isFormulaLike("ordinary text"), false);
});

test("recomputes diagnostics after manual edits and keeps de-duplicate off by default", () => {
  const rows = [
    [" Ada ", "bad-email", "31/02/2025"],
    ["Ada", "bad-email", "2025-01-04"]
  ];
  const headers = ["Name", "Email", "Date"];
  const first = cleanRows(headers, rows, settings, new Map());
  assert.equal(first.diagnostics.invalidEmails, 2);
  assert.equal(first.diagnostics.invalidDates, 1);
  assert.equal(first.diagnostics.duplicateValues, 1);
  assert.equal(first.output.length, 2);

  const edits = new Map([["0:1", "ada@example.com"], ["0:2", "2025-01-05"]]);
  const edited = cleanRows(headers, rows, settings, edits);
  assert.equal(edited.diagnostics.invalidEmails, 1);
  assert.equal(edited.diagnostics.invalidDates, 0);
  assert.equal(edited.diagnostics.duplicateValues, 0);
});
