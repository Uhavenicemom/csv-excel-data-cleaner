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
const DATA_LIMITS = {
    maxRows: 200_000,
    maxColumns: 256,
    maxCells: 2_000_000,
    maxCellCharacters: 100_000,
    maxSheets: 50
};
function dataLimitError(detail) {
    return new Error(`${detail} Try a smaller or narrower table.`);
}
function assertCellLength(value, limits = DATA_LIMITS) {
    if (cellToString(value).length > limits.maxCellCharacters) {
        throw dataLimitError(`A cell contains more than ${limits.maxCellCharacters.toLocaleString("en-US")} characters.`);
    }
}
function assertSheetNames(sheetNames, limits = DATA_LIMITS) {
    if (sheetNames.length > limits.maxSheets) {
        throw dataLimitError(`This workbook contains more than ${limits.maxSheets.toLocaleString("en-US")} worksheets.`);
    }
}
function assertTableLimits(rows, limits = DATA_LIMITS) {
    if (rows.length > limits.maxRows) {
        throw dataLimitError(`This table contains more than ${limits.maxRows.toLocaleString("en-US")} rows.`);
    }
    let cells = 0;
    for (const row of rows){
        if (row.length > limits.maxColumns) {
            throw dataLimitError(`This table contains more than ${limits.maxColumns.toLocaleString("en-US")} columns.`);
        }
        cells += row.length;
        if (cells > limits.maxCells) {
            throw dataLimitError(`This table contains more than ${limits.maxCells.toLocaleString("en-US")} cells.`);
        }
        row.forEach((value)=>assertCellLength(value, limits));
    }
}
return { DATA_LIMITS, dataLimitError, assertCellLength, assertSheetNames, assertTableLimits };
})();
const __module2 = (() => {
const { DATA_LIMITS, dataLimitError } = __module1;
const { cellToString } = __module0;
const DELIMITERS = [
    ",",
    ";",
    "\t"
];
function decodeUtf8(buffer) {
    try {
        return new TextDecoder("utf-8", {
            fatal: true
        }).decode(buffer).replace(/^\uFEFF/, "");
    } catch  {
        throw new Error("This CSV is not valid UTF-8. Save it as UTF-8 in your spreadsheet app and try again.");
    }
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
function csvToRows(text, limits = DATA_LIMITS) {
    const source = text.replace(/^\uFEFF/, "");
    const delimiter = detectCsvDelimiter(source);
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    let cellCount = 0;
    const pushCell = ()=>{
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
    const pushRow = ()=>{
        if (rows.length >= limits.maxRows) {
            throw dataLimitError(`This table contains more than ${limits.maxRows.toLocaleString("en-US")} rows.`);
        }
        rows.push(row);
        row = [];
    };
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
    const hasFinalRow = row.some((value)=>value !== "") || cell !== "";
    if (hasFinalRow) {
        pushCell();
        pushRow();
    }
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
const __module3 = (() => {
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
const __module4 = (() => {
const { assertSheetNames, assertTableLimits, DATA_LIMITS, dataLimitError } = __module1;
function requireXlsx(candidate) {
    if (!candidate) throw new Error("Excel support is unavailable. Reload the page and try again.");
    return candidate;
}
function readWorkbook(api, buffer) {
    const workbook = api.read(buffer, {
        type: "array",
        cellDates: true,
        dense: true,
        sheetRows: DATA_LIMITS.maxRows + 1
    });
    if (!workbook.SheetNames.length) throw new Error("This Excel file has no worksheets.");
    assertSheetNames(workbook.SheetNames);
    return workbook;
}
function sheetRows(api, workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Worksheet “${sheetName}” could not be found.`);
    const range = typeof sheet === "object" && sheet !== null && "!ref" in sheet ? sheet["!ref"] : undefined;
    if (typeof range === "string") {
        const decoded = api.utils.decode_range(range);
        const rows = decoded.e.r - decoded.s.r + 1;
        const columns = decoded.e.c - decoded.s.c + 1;
        if (rows > DATA_LIMITS.maxRows) {
            throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxRows.toLocaleString("en-US")} rows.`);
        }
        if (columns > DATA_LIMITS.maxColumns) {
            throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxColumns.toLocaleString("en-US")} columns.`);
        }
        if (rows * columns > DATA_LIMITS.maxCells) {
            throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxCells.toLocaleString("en-US")} cells.`);
        }
    }
    const rows = api.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true
    });
    assertTableLimits(rows);
    return rows;
}
function writeWorkbook(api, rows) {
    assertTableLimits(rows);
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
const __module5 = (() => {
const { csvToRows, decodeUtf8, serializeCsv } = __module2;
const { hasXlsxSignature } = __module3;
const { assertTableLimits } = __module1;
const { normalizeError } = __module0;
const { readWorkbook, requireXlsx, sheetRows, writeWorkbook } = __module4;
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
    assertTableLimits(rows);
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
