(() => {
"use strict";
const __module0 = (() => {

function isValidDateObject(value) {
    return value instanceof Date && Number.isFinite(value.getTime());
}
function cellToString(value) {
    if (value === null || value === undefined) return "";
    if (isValidDateObject(value)) {
        const year = String(value.getFullYear()).padStart(4, "0");
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    return String(value);
}
function isBlankRow(row) {
    return row.every((cell)=>cellToString(cell).trim() === "");
}
function normalizeError(error) {
    return error instanceof Error ? error.message : "Something went wrong while processing this file.";
}
return { isValidDateObject, cellToString, isBlankRow, normalizeError };
})();
const __module1 = (() => {
const { cellToString } = __module0;
const DELIMITERS = [
    ",",
    ";",
    "\t"
];
function decodeUtf8(buffer) {
    const text = new TextDecoder("utf-8", {
        fatal: false
    }).decode(buffer).replace(/^\uFEFF/, "");
    if (text.includes("\uFFFD")) {
        throw new Error("This CSV is not valid UTF-8. Save it as UTF-8 in your spreadsheet app and try again.");
    }
    return text;
}
function detectCsvDelimiter(text) {
    const counts = new Map(DELIMITERS.map((delimiter)=>[
            delimiter,
            0
        ]));
    let inQuotes = false;
    let lines = 0;
    for(let index = 0; index < text.length && lines < 12; index += 1){
        const character = text[index];
        if (character === '"') {
            if (inQuotes && text[index + 1] === '"') index += 1;
            else inQuotes = !inQuotes;
        } else if (!inQuotes && DELIMITERS.includes(character)) {
            counts.set(character, (counts.get(character) ?? 0) + 1);
        } else if (!inQuotes && (character === "\n" || character === "\r")) {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            lines += 1;
        }
    }
    return [
        ...counts.entries()
    ].reduce((best, current)=>current[1] > best[1] ? current : best, [
        ",",
        0
    ])[0];
}
function csvToRows(text) {
    const source = text.replace(/^\uFEFF/, "");
    const delimiter = detectCsvDelimiter(source);
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for(let index = 0; index < source.length; index += 1){
        const character = source[index];
        if (character === '"') {
            if (inQuotes && source[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (character === delimiter && !inQuotes) {
            row.push(cell);
            cell = "";
        } else if ((character === "\n" || character === "\r") && !inQuotes) {
            if (character === "\r" && source[index + 1] === "\n") index += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character ?? "";
        }
    }
    if (inQuotes) throw new Error("This CSV has an unmatched quotation mark. Fix the quotation marks and try again.");
    row.push(cell);
    if (row.some((value)=>value !== "") || cell !== "") rows.push(row);
    return rows;
}
function csvEscape(value, forceQuote = false) {
    const source = cellToString(value);
    return forceQuote || /[",\n\r\t]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}
function serializeCsv(rows, forceQuote = false) {
    return rows.map((row)=>row.map((value)=>csvEscape(value, forceQuote)).join(",")).join("\r\n");
}
return { decodeUtf8, detectCsvDelimiter, csvToRows, csvEscape, serializeCsv };
})();
const __module2 = (() => {
const { cellToString } = __module0;
const HEADER_SCAN_LIMIT = 20;
function uniqueHeaders(headerRow) {
    const seen = new Map();
    let generated = 0;
    const headers = headerRow.map((value, index)=>{
        const supplied = cellToString(value).trim();
        const base = supplied || `Column ${index + 1}`;
        if (!supplied) generated += 1;
        const occurrence = (seen.get(base) ?? 0) + 1;
        seen.set(base, occurrence);
        return occurrence === 1 ? base : `${base} (${occurrence})`;
    });
    return {
        headers,
        generated
    };
}
function prepareSheet(rawRows, headerIndex) {
    const selectedHeader = rawRows[headerIndex];
    if (!selectedHeader) throw new Error("Choose a valid header row.");
    const dataRows = rawRows.slice(headerIndex + 1);
    const width = Math.max(selectedHeader.length, ...dataRows.map((row)=>row.length));
    if (width === 0) throw new Error("This worksheet does not contain any columns.");
    const paddedHeader = Array.from({
        length: width
    }, (_, index)=>selectedHeader[index] ?? "");
    const { headers, generated } = uniqueHeaders(paddedHeader);
    const rows = dataRows.map((row)=>Array.from({
            length: width
        }, (_, index)=>row[index] ?? ""));
    return {
        headers,
        rows,
        generatedHeaderCount: generated
    };
}
function rowPreview(row) {
    return row.map(cellToString).map((value)=>value.trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 54) || "Empty row";
}
function headerCandidates(rawRows) {
    return rawRows.slice(0, HEADER_SCAN_LIMIT).map((row, index)=>({
            index,
            nonEmpty: row.filter((cell)=>cellToString(cell).trim()).length,
            preview: rowPreview(row)
        })).filter((candidate)=>candidate.nonEmpty > 0);
}
function findHeaderRow(rawRows) {
    const candidates = headerCandidates(rawRows);
    if (!candidates.length) throw new Error("This worksheet is empty.");
    return candidates[0]?.index ?? 0;
}
function hasXlsxSignature(buffer) {
    const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 && bytes[3] === 0x04 || bytes[2] === 0x05 && bytes[3] === 0x06 || bytes[2] === 0x07 && bytes[3] === 0x08);
}
return { HEADER_SCAN_LIMIT, uniqueHeaders, prepareSheet, rowPreview, headerCandidates, findHeaderRow, hasXlsxSignature };
})();
const __module3 = (() => {

function requireXlsx(candidate) {
    if (!candidate) throw new Error("Excel support is unavailable. Reload the page and try again.");
    return candidate;
}
function readWorkbook(api, buffer) {
    const workbook = api.read(buffer, {
        type: "array",
        cellDates: true,
        dense: true
    });
    if (!workbook.SheetNames.length) throw new Error("This Excel file has no worksheets.");
    return workbook;
}
function sheetRows(api, workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Worksheet “${sheetName}” could not be found.`);
    return api.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true
    });
}
function writeWorkbook(api, rows) {
    const workbook = api.utils.book_new();
    const sheet = api.utils.aoa_to_sheet(rows);
    api.utils.book_append_sheet(workbook, sheet, "Cleaned data");
    const result = api.write(workbook, {
        bookType: "xlsx",
        type: "array"
    });
    if (result instanceof ArrayBuffer || Object.prototype.toString.call(result) === "[object ArrayBuffer]") {
        return result.slice(0);
    }
    if (ArrayBuffer.isView(result)) {
        return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
    }
    throw new Error("The Excel export returned an unsupported binary format.");
}
return { requireXlsx, readWorkbook, sheetRows, writeWorkbook };
})();
const __module4 = (() => {
const { csvToRows, decodeUtf8, serializeCsv } = __module1;
const { hasXlsxSignature } = __module2;
const { normalizeError } = __module0;
const { readWorkbook, requireXlsx, sheetRows, writeWorkbook } = __module3;
const scope = globalThis;
let workbook = null;
let api = null;
function ensureXlsx() {
    if (api) return api;
    if (!scope.XLSX) {
        scope.importScripts(new URL("vendor/xlsx.full.min.js", scope.location.href).href);
    }
    api = requireXlsx(scope.XLSX);
    return api;
}
function send(response, transfer = []) {
    scope.postMessage(response, transfer);
}
function exportRows(format, rows, quoteAll) {
    if (format === "xlsx") {
        return {
            buffer: writeWorkbook(ensureXlsx(), rows),
            mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            extension: "xlsx"
        };
    }
    return {
        buffer: new TextEncoder().encode(`\uFEFF${serializeCsv(rows, quoteAll)}`).buffer,
        mime: "text/csv;charset=utf-8",
        extension: "csv"
    };
}
scope.onmessage = (event)=>{
    const request = event.data;
    try {
        if (request.type === "parse") {
            if (request.fileType === "csv") {
                workbook = null;
                send({
                    id: request.id,
                    ok: true,
                    type: "parse",
                    rows: csvToRows(decodeUtf8(request.buffer)),
                    sheetNames: [],
                    activeSheet: null
                });
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
                sheetNames: [
                    ...workbook.SheetNames
                ],
                activeSheet
            });
            return;
        }
        if (request.type === "sheet") {
            if (!workbook) throw new Error("Choose an Excel file before changing worksheets.");
            send({
                id: request.id,
                ok: true,
                type: "sheet",
                rows: sheetRows(ensureXlsx(), workbook, request.sheetName),
                sheetName: request.sheetName
            });
            return;
        }
        const result = exportRows(request.format, request.rows, request.quoteAll);
        send({
            id: request.id,
            ok: true,
            type: "export",
            ...result
        }, [
            result.buffer
        ]);
    } catch (error) {
        send({
            id: request.id,
            ok: false,
            error: normalizeError(error)
        });
    }
};
return {};
})();
})();
