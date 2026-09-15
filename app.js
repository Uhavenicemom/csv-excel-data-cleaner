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
const { cellToString, isValidDateObject } = __module0;
const MONTHS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
};
function isValidDateParts({ year, month, day }) {
    if (![
        year,
        month,
        day
    ].every(Number.isInteger)) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function formatDate(parts, format) {
    const year = String(parts.year % 100).padStart(2, "0");
    const month = String(parts.month).padStart(2, "0");
    const day = String(parts.day).padStart(2, "0");
    if (format === "MM-DD-YY") return `${month}-${day}-${year}`;
    if (format === "YY-MM-DD") return `${year}-${month}-${day}`;
    return `${day}-${month}-${year}`;
}
function validResult(parts, format) {
    return isValidDateParts(parts) ? {
        status: "valid",
        value: formatDate(parts, format),
        parts
    } : {
        status: "invalid"
    };
}
function expandYear(year) {
    return year < 100 ? 2000 + year : year;
}
function parseNumericDate(source, format, inputOrder) {
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(source)) {
        const [year, month, day] = source.split(/[/-]/).map(Number);
        if (year === undefined || month === undefined || day === undefined) return {
            status: "invalid"
        };
        return validResult({
            year,
            month,
            day
        }, format);
    }
    if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(source)) return null;
    const [first, second, rawYear] = source.split(/[/-]/).map(Number);
    if (first === undefined || second === undefined || rawYear === undefined) return {
        status: "invalid"
    };
    const order = first > 12 && second <= 12 ? "DD-MM-YY" : second > 12 && first <= 12 ? "MM-DD-YY" : inputOrder;
    const [month, day] = order === "MM-DD-YY" ? [
        first,
        second
    ] : [
        second,
        first
    ];
    return validResult({
        year: expandYear(rawYear),
        month,
        day
    }, format);
}
function parseTextDate(source, format) {
    const monthFirst = source.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/i);
    const dayFirst = source.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?[,]?\s+(\d{4})$/i);
    const monthName = monthFirst?.[1] ?? dayFirst?.[2];
    const month = monthName ? MONTHS[monthName.toLowerCase()] : undefined;
    const day = Number(monthFirst?.[2] ?? dayFirst?.[1]);
    const year = Number(monthFirst?.[3] ?? dayFirst?.[3]);
    if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return {
        status: "invalid"
    };
    return validResult({
        year,
        month,
        day
    }, format);
}
function parseDate(value, outputFormat, inputOrder) {
    if (isValidDateObject(value)) {
        return validResult({
            year: value.getFullYear(),
            month: value.getMonth() + 1,
            day: value.getDate()
        }, outputFormat);
    }
    const source = cellToString(value).trim();
    if (!source) return {
        status: "empty"
    };
    return parseNumericDate(source, outputFormat, inputOrder) ?? parseTextDate(source, outputFormat);
}
return { isValidDateParts, formatDate, parseDate };
})();
const __module2 = (() => {
const { parseDate } = __module1;
const { cellToString, isBlankRow, isValidDateObject } = __module0;
function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(cellToString(value).trim());
}
function editedValue(original, sourceIndex, columnIndex, manualEdits) {
    return manualEdits.get(`${sourceIndex}:${columnIndex}`) ?? cellToString(original);
}
function prepareRows(rows, settings, manualEdits) {
    return rows.map((original, sourceIndex)=>{
        const values = original.map((value, columnIndex)=>editedValue(value, sourceIndex, columnIndex, manualEdits));
        let changed = original.some((value)=>isValidDateObject(value));
        if (settings.trimWhitespace) {
            values.forEach((value, index)=>{
                const trimmed = value.trim();
                if (trimmed !== value) {
                    values[index] = trimmed;
                    changed = true;
                }
            });
        }
        for(let index = 0; index < values.length; index += 1){
            if (manualEdits.has(`${sourceIndex}:${index}`) && values[index] !== cellToString(original[index])) changed = true;
        }
        return {
            values,
            sourceIndex,
            changed
        };
    });
}
function duplicateCount(rows, columnIndex) {
    if (columnIndex < 0) return 0;
    const seen = new Set();
    let duplicates = 0;
    rows.forEach((row)=>{
        const key = (row[columnIndex] ?? "").trim().toLowerCase();
        if (!key) return;
        if (seen.has(key)) duplicates += 1;
        else seen.add(key);
    });
    return duplicates;
}
function diagnoseRows(headers, rows, settings) {
    const dedupIndex = headers.indexOf(settings.dedupColumn);
    const emailIndex = headers.indexOf(settings.emailColumn);
    const dateIndex = headers.indexOf(settings.dateColumn);
    return {
        duplicateValues: duplicateCount(rows, dedupIndex),
        invalidEmails: emailIndex < 0 ? 0 : rows.filter((row)=>{
            const value = (row[emailIndex] ?? "").trim();
            return Boolean(value) && !isEmail(value);
        }).length,
        invalidDates: dateIndex < 0 ? 0 : rows.filter((row)=>{
            const value = (row[dateIndex] ?? "").trim();
            return Boolean(value) && parseDate(value, settings.dateFormat, settings.inputDateOrder).status === "invalid";
        }).length
    };
}
function validateAndNormalize(values, headers, settings) {
    const next = [
        ...values
    ];
    const issues = {};
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
    return {
        values: next,
        issues,
        changed,
        normalizedDate
    };
}
function cleanRows(headers, rows, settings, manualEdits) {
    const prepared = prepareRows(rows, settings, manualEdits);
    const remaining = settings.removeEmpty ? prepared.filter((entry)=>!isBlankRow(entry.values)) : prepared;
    const diagnostics = diagnoseRows(headers, remaining.map((entry)=>entry.values), settings);
    const summary = {
        changedRows: 0,
        emptyRows: prepared.length - remaining.length,
        duplicateRows: 0,
        invalidEmails: 0,
        invalidDates: 0,
        normalizedDates: 0
    };
    const dedupIndex = headers.indexOf(settings.dedupColumn);
    const seen = new Set();
    const output = [];
    remaining.forEach((entry)=>{
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
        summary.invalidEmails += Object.values(processed.issues).filter((issue)=>issue === "Invalid email").length;
        summary.invalidDates += Object.values(processed.issues).filter((issue)=>issue === "Invalid date").length;
        output.push({
            values: processed.values,
            issues: processed.issues,
            changed,
            sourceIndex: entry.sourceIndex
        });
    });
    return {
        output,
        summary,
        diagnostics,
        preparedRows: remaining.map((entry)=>entry.values)
    };
}
function issuesForOriginalRow(row, headers, settings) {
    const values = row.map(cellToString);
    return validateAndNormalize(values, headers, settings).issues;
}
return { isEmail, cleanRows, issuesForOriginalRow };
})();
const __module3 = (() => {

const SAMPLE_HEADERS = [
    "Customer ID",
    "Full Name",
    "Email",
    "Sign Up Date",
    "Amount",
    "Country",
    "Notes"
];
const SAMPLE_ROWS = [
    [
        "C-1042",
        "  Ava Nguyen  ",
        " ava.nguyen@example.com ",
        "2025/01/04",
        "99.00",
        "USA",
        "First order"
    ],
    [
        "C-1043",
        "Mateo Silva",
        "mateo.silva@example.com",
        "04-01-25",
        "149",
        "Brazil",
        "Asked for invoice"
    ],
    [
        "C-1044",
        "Priya Shah",
        "invalid-email",
        "Jan 6, 2025",
        "200.00",
        "India",
        "Contact before renewal"
    ],
    [
        "",
        "",
        "",
        "",
        "",
        "",
        ""
    ],
    [
        "C-1046",
        "Noah Williams",
        "noah.williams@example.com",
        "1/7/25",
        "99",
        "Canada",
        " "
    ],
    [
        "C-1047",
        "Elena Rossi",
        "elena.rossi@example.com",
        "2025-01-07",
        "99.0",
        "Italy",
        "Customer requested VAT receipt"
    ],
    [
        "C-1048",
        "Ava Nguyen",
        "ava.nguyen@example.com",
        "2025/01/04",
        "99.00",
        "USA",
        "Duplicate import"
    ],
    [
        "C-1049",
        "Liam O'Connor",
        "liam.oconnor@example.com",
        "13/01/2025",
        "250",
        "Ireland",
        "Priority account"
    ],
    [
        "C-1050",
        "Samira Khan",
        "samira.khan@example.com",
        "01-08-2025",
        "175",
        "United Arab Emirates",
        "Check preferred language"
    ],
    [
        "C-1051",
        "Ryo Tanaka",
        "ryo.tanaka@example.com",
        "Jan 9 2025",
        "300",
        "Japan",
        "Renewal in Q1"
    ],
    [
        "C-1052",
        "Mira Chen",
        "mira.chen@example.com",
        "not-a-date",
        "80",
        "Singapore",
        "Missing source format"
    ],
    [
        "C-1053",
        "Theo Martin",
        "theo.martin@example.com",
        "31/02/2025",
        "125",
        "France",
        "Date typed manually"
    ],
    [
        "C-1054",
        "Lina Petrov",
        "lina.petrov@example.com",
        "2025/01/15",
        "=SUM(80, 45)",
        "Ukraine",
        "Formula-like amount"
    ],
    [
        "C-1055",
        "Dev Patel",
        "dev.patel@example",
        "15 Jan 2025",
        "199.95",
        "India",
        "Email needs review"
    ],
    [
        "C-1056",
        "  Chloe Martin",
        " chloe.martin@example.com",
        "2025/01/16",
        "149.50",
        "Czechia",
        "Follow-up"
    ],
    [
        "C-1057",
        "Nia Brooks",
        "nia.brooks@example.com",
        "2025-01-17",
        "220",
        "USA",
        " "
    ],
    [
        "C-1058",
        "Carlos Torres",
        "ryo.tanaka@example.com",
        "17/01/2025",
        "300",
        "Mexico",
        "Duplicate email"
    ]
];
return { SAMPLE_HEADERS, SAMPLE_ROWS };
})();
const __module4 = (() => {
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
const __module5 = (() => {
const { DATA_LIMITS, dataLimitError } = __module4;
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
const __module6 = (() => {
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
const __module7 = (() => {
const { assertSheetNames, assertTableLimits, DATA_LIMITS, dataLimitError } = __module4;
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
const __module8 = (() => {
const { csvToRows, decodeUtf8, serializeCsv } = __module5;
const { hasXlsxSignature } = __module6;
const { assertTableLimits } = __module4;
const { normalizeError } = __module0;
const { readWorkbook, requireXlsx, sheetRows, writeWorkbook } = __module7;
const HOSTED_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
const LOCAL_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const XLSX_SCRIPT_URL = "vendor/xlsx.full.min.js";
let xlsxLoadPromise = null;
function loadMainThreadXlsx() {
    if (window.XLSX) return Promise.resolve(requireXlsx(window.XLSX));
    if (xlsxLoadPromise) return xlsxLoadPromise;
    const script = document.createElement("script");
    script.src = XLSX_SCRIPT_URL;
    script.async = true;
    xlsxLoadPromise = new Promise((resolve, reject)=>{
        script.addEventListener("load", ()=>{
            try {
                resolve(requireXlsx(window.XLSX));
            } catch (error) {
                reject(error);
            }
        }, {
            once: true
        });
        script.addEventListener("error", ()=>{
            reject(new Error("Excel support could not be loaded. Reload the page and try again."));
        }, {
            once: true
        });
    }).catch((error)=>{
        xlsxLoadPromise = null;
        script.remove();
        throw error;
    });
    document.head.append(script);
    return xlsxLoadPromise;
}
class FileProcessor {
    worker = null;
    directWorkbook = null;
    requestId = 0;
    pending = new Map();
    get supportsBackgroundProcessing() {
        return window.location.protocol !== "file:" && "Worker" in window;
    }
    destroyWorker(error = new Error("Background processing was stopped.")) {
        this.worker?.terminate();
        this.worker = null;
        this.pending.forEach(({ reject, timer })=>{
            window.clearTimeout(timer);
            reject(error);
        });
        this.pending.clear();
    }
    ensureWorker() {
        if (this.worker) return this.worker;
        const worker = new Worker("xlsx-worker.js?v=2");
        worker.addEventListener("message", (event)=>{
            const pending = this.pending.get(event.data.id);
            if (!pending) return;
            this.pending.delete(event.data.id);
            window.clearTimeout(pending.timer);
            if (event.data.ok) pending.resolve(event.data);
            else pending.reject(new Error(event.data.error));
        });
        worker.addEventListener("error", ()=>{
            this.destroyWorker(new Error("Background processing could not start in this browser."));
        });
        this.worker = worker;
        return worker;
    }
    callWorker(message, transfer = []) {
        const worker = this.ensureWorker();
        const id = ++this.requestId;
        return new Promise((resolve, reject)=>{
            const timer = window.setTimeout(()=>{
                this.destroyWorker(new Error("Background processing took too long and was stopped."));
            }, 30_000);
            this.pending.set(id, {
                resolve,
                reject,
                timer
            });
            try {
                worker.postMessage({
                    id,
                    ...message
                }, transfer);
            } catch (error) {
                window.clearTimeout(timer);
                this.pending.delete(id);
                reject(new Error(normalizeError(error)));
            }
        });
    }
    async loadDirect(fileType, buffer) {
        if (fileType === "csv") {
            return {
                rows: csvToRows(decodeUtf8(buffer)),
                sheetNames: [],
                activeSheet: null,
                usedWorker: false
            };
        }
        if (!hasXlsxSignature(buffer)) throw new Error("This file does not appear to be a valid .xlsx workbook.");
        const api = await loadMainThreadXlsx();
        this.directWorkbook = readWorkbook(api, buffer);
        const activeSheet = this.directWorkbook.SheetNames[0] ?? null;
        if (!activeSheet) throw new Error("This Excel file has no worksheets.");
        return {
            rows: sheetRows(api, this.directWorkbook, activeSheet),
            sheetNames: [
                ...this.directWorkbook.SheetNames
            ],
            activeSheet,
            usedWorker: false
        };
    }
    async load(fileType, buffer) {
        this.directWorkbook = null;
        this.destroyWorker(new Error("A newer file replaced the previous operation."));
        if (!this.supportsBackgroundProcessing) return this.loadDirect(fileType, buffer);
        if (fileType === "xlsx" && !hasXlsxSignature(buffer)) {
            throw new Error("This file does not appear to be a valid .xlsx workbook.");
        }
        try {
            const response = await this.callWorker({
                type: "parse",
                fileType,
                buffer
            }, [
                buffer
            ]);
            if (!response.ok || response.type !== "parse") throw new Error("The background processor returned an unexpected response.");
            return {
                rows: response.rows,
                sheetNames: response.sheetNames,
                activeSheet: response.activeSheet,
                usedWorker: true
            };
        } catch (error) {
            this.destroyWorker(new Error("Background processing failed and was stopped."));
            throw new Error(`${normalizeError(error)} The file was not processed. Try a smaller file or reload the page.`);
        }
    }
    async selectSheet(sheetName) {
        if (this.worker) {
            const response = await this.callWorker({
                type: "sheet",
                sheetName
            });
            if (!response.ok || response.type !== "sheet") throw new Error("The worksheet could not be loaded.");
            return response.rows;
        }
        const api = await loadMainThreadXlsx();
        if (!this.directWorkbook) throw new Error("Choose the Excel file again before changing worksheets.");
        return sheetRows(api, this.directWorkbook, sheetName);
    }
    async exportRows(format, rows, quoteAll = false) {
        assertTableLimits(rows);
        if (this.supportsBackgroundProcessing) {
            try {
                const response = await this.callWorker({
                    type: "export",
                    format,
                    rows,
                    quoteAll
                });
                if (!response.ok || response.type !== "export") throw new Error("The exported file could not be prepared.");
                return {
                    buffer: response.buffer,
                    mime: response.mime,
                    extension: response.extension
                };
            } catch (error) {
                this.destroyWorker(new Error("Background export failed and was stopped."));
                throw new Error(`${normalizeError(error)} No file was downloaded.`);
            }
        }
        if (format === "xlsx") {
            const api = await loadMainThreadXlsx();
            return {
                buffer: writeWorkbook(api, rows),
                mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                extension: "xlsx"
            };
        }
        const buffer = new TextEncoder().encode(`\uFEFF${serializeCsv(rows, quoteAll)}`).buffer;
        return {
            buffer,
            mime: "text/csv;charset=utf-8",
            extension: "csv"
        };
    }
    dispose() {
        this.destroyWorker(new Error("The page was closed before background processing finished."));
        this.directWorkbook = null;
    }
}
return { HOSTED_FILE_LIMIT_BYTES, LOCAL_FILE_LIMIT_BYTES, FileProcessor };
})();
const __module9 = (() => {
const { cellToString } = __module0;
const FORMULA_PREFIX = /^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u;
function isFormulaLike(value) {
    return FORMULA_PREFIX.test(cellToString(value));
}
function dangerousFormulaCount(rows) {
    return rows.reduce((total, row)=>total + row.filter(isFormulaLike).length, 0);
}
function makeSpreadsheetSafe(value) {
    const source = cellToString(value);
    return isFormulaLike(source) ? `'${source}` : source;
}
function safeRows(rows) {
    return rows.map((row)=>row.map(makeSpreadsheetSafe));
}
return { isFormulaLike, dangerousFormulaCount, makeSpreadsheetSafe, safeRows };
})();
const __module10 = (() => {
const { cellToString } = __module0;
const VIRTUAL_ROW_BUFFER = 12;
const virtualTables = new WeakMap();
function insertPlainText(editor, text) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
        editor.textContent = `${editor.textContent ?? ""}${text}`;
        return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}
function makeEditableCell(value, entry, columnIndex, options) {
    const editor = document.createElement("span");
    editor.className = "cell-editor";
    editor.contentEditable = "true";
    editor.spellcheck = false;
    editor.setAttribute("role", "textbox");
    editor.tabIndex = 0;
    editor.setAttribute("aria-label", `Edit row ${entry.sourceIndex + 1}, ${options.headers[columnIndex] ?? `Column ${columnIndex + 1}`}`);
    editor.textContent = value;
    editor.addEventListener("keydown", (event)=>{
        if (event.key === "Enter") {
            event.preventDefault();
            editor.blur();
        } else if (event.key === "Escape") {
            event.preventDefault();
            editor.textContent = value;
            editor.blur();
        }
    });
    editor.addEventListener("paste", (event)=>{
        event.preventDefault();
        insertPlainText(editor, event.clipboardData?.getData("text/plain") ?? "");
    });
    editor.addEventListener("blur", ()=>{
        const nextValue = cellToString(editor.textContent).replace(/[\r\n]+/g, " ");
        if (nextValue !== value && !options.onEdit(entry.sourceIndex, columnIndex, nextValue)) {
            editor.textContent = value;
        }
    });
    return editor;
}
function createTableHeader(headers) {
    const head = document.createElement("thead");
    const row = document.createElement("tr");
    const number = document.createElement("th");
    number.scope = "col";
    number.textContent = "#";
    row.append(number);
    headers.forEach((header)=>{
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = header;
        row.append(cell);
    });
    head.append(row);
    return head;
}
function isCleanedRow(entry) {
    return !Array.isArray(entry);
}
function createDataRow(entry, visibleIndex, options) {
    const cleaned = isCleanedRow(entry);
    const values = cleaned ? entry.values : entry;
    const sourceIndex = cleaned ? entry.sourceIndex : visibleIndex;
    const issues = cleaned ? entry.issues : options.originalIssues(entry);
    const row = document.createElement("tr");
    row.setAttribute("aria-rowindex", String(visibleIndex + 2));
    const number = document.createElement("td");
    number.textContent = String(sourceIndex + 1);
    row.append(number);
    values.forEach((value, columnIndex)=>{
        const cell = document.createElement("td");
        const display = cellToString(value);
        if (options.kind === "after" && cleaned) {
            cell.append(makeEditableCell(display, entry, columnIndex, options));
        } else {
            cell.textContent = display || "—";
        }
        const issueText = issues[columnIndex];
        if (issueText) {
            cell.classList.add("warning");
            const issue = document.createElement("span");
            issue.className = "issue";
            issue.textContent = issueText;
            cell.append(issue);
        } else if (options.kind === "after" && cleaned && entry.changed) {
            cell.classList.add("changed");
        }
        row.append(cell);
    });
    return row;
}
function tableRowHeight() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--table-row-height");
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 34;
}
function createSpacerRow(height, columnCount) {
    const spacer = document.createElement("tr");
    spacer.className = "virtual-spacer";
    const cell = document.createElement("td");
    cell.colSpan = columnCount + 1;
    cell.style.height = `${height}px`;
    spacer.append(cell);
    return spacer;
}
function renderTable(table, options) {
    const scroll = table.closest(".table-scroll");
    if (!scroll) throw new Error("A data table is missing its scroll container.");
    const previous = virtualTables.get(table);
    if (previous) {
        scroll.removeEventListener("scroll", previous.handleScroll);
        previous.observer?.disconnect();
        if (previous.frame) window.cancelAnimationFrame(previous.frame);
    }
    table.replaceChildren(createTableHeader(options.headers));
    table.setAttribute("aria-rowcount", String(options.rows.length + 1));
    table.setAttribute("aria-colcount", String(options.headers.length + 1));
    const controller = {
        frame: 0,
        handleScroll: ()=>undefined,
        observer: null
    };
    const renderVisibleRows = ()=>{
        const rowHeight = tableRowHeight();
        const viewportHeight = scroll.clientHeight || 400;
        const maximumScroll = Math.max(0, (options.rows.length + 1) * rowHeight - viewportHeight);
        if (scroll.scrollTop > maximumScroll) scroll.scrollTop = maximumScroll;
        const bodyScrollTop = Math.max(0, scroll.scrollTop - rowHeight);
        const firstVisible = Math.floor(bodyScrollTop / rowHeight);
        const visibleRows = Math.ceil(viewportHeight / rowHeight);
        const start = Math.max(0, firstVisible - VIRTUAL_ROW_BUFFER);
        const end = Math.min(options.rows.length, firstVisible + visibleRows + VIRTUAL_ROW_BUFFER);
        const body = document.createElement("tbody");
        if (start > 0) body.append(createSpacerRow(start * rowHeight, options.headers.length));
        options.rows.slice(start, end).forEach((entry, index)=>{
            body.append(createDataRow(entry, start + index, options));
        });
        if (end < options.rows.length) {
            body.append(createSpacerRow((options.rows.length - end) * rowHeight, options.headers.length));
        }
        table.tBodies[0]?.replaceWith(body);
        if (!table.tBodies[0]) table.append(body);
    };
    controller.handleScroll = ()=>{
        if (controller.frame) return;
        controller.frame = window.requestAnimationFrame(()=>{
            controller.frame = 0;
            renderVisibleRows();
        });
    };
    if ("ResizeObserver" in window) {
        controller.observer = new ResizeObserver(controller.handleScroll);
        controller.observer.observe(scroll);
    }
    virtualTables.set(table, controller);
    scroll.addEventListener("scroll", controller.handleScroll, {
        passive: true
    });
    renderVisibleRows();
}
return { renderTable };
})();
const __module11 = (() => {

const THEME_STORAGE_KEY = "data-cleaner-theme";
function savedTheme() {
    try {
        const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
        return theme === "dark" || theme === "light" ? theme : null;
    } catch  {
        return null;
    }
}
function systemTheme() {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function createThemeController(elements, announce) {
    const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = (theme, options = {})=>{
        document.documentElement.dataset.theme = theme;
        const isDark = theme === "dark";
        const nextAction = isDark ? "light" : "dark";
        elements.toggle.setAttribute("aria-pressed", String(isDark));
        elements.toggle.setAttribute("aria-label", `Switch to ${nextAction} theme`);
        elements.toggle.title = `Switch to ${nextAction} theme`;
        elements.label.textContent = isDark ? "Light" : "Dark";
        if (options.save) {
            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, theme);
            } catch  {}
        }
        if (options.announceChange) announce(`${isDark ? "Dark" : "Light"} theme enabled.`);
    };
    const onSystemThemeChange = (event)=>{
        if (!savedTheme()) apply(event.matches ? "dark" : "light");
    };
    return {
        initialize () {
            const initial = document.documentElement.dataset.theme;
            apply(initial === "dark" || initial === "light" ? initial : savedTheme() ?? systemTheme());
            preference?.addEventListener("change", onSystemThemeChange);
        },
        toggle () {
            apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark", {
                save: true,
                announceChange: true
            });
        },
        dispose () {
            preference?.removeEventListener("change", onSystemThemeChange);
        }
    };
}
return { createThemeController };
})();
const __module12 = (() => {
const { cleanRows, isEmail, issuesForOriginalRow } = __module2;
const { SAMPLE_HEADERS, SAMPLE_ROWS } = __module3;
const { parseDate } = __module1;
const { FileProcessor, HOSTED_FILE_LIMIT_BYTES, LOCAL_FILE_LIMIT_BYTES } = __module8;
const { assertCellLength } = __module4;
const { dangerousFormulaCount, safeRows } = __module9;
const { findHeaderRow, headerCandidates, prepareSheet } = __module6;
const { renderTable } = __module10;
const { createThemeController } = __module11;
const { cellToString, normalizeError } = __module0;
const DATE_HEADER_HINT = /\b(date|day|time|created|updated|due|deadline|start|end|birth|birthday|dob|joined)\b/i;
const EMAIL_HEADER_HINT = /\be-?mail\b/i;
const DEDUP_HEADER_HINT = /\b(e-?mail|id|identifier|code|reference|number)\b/i;
function required(selector) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Required interface element is missing: ${selector}`);
    return element;
}
const els = {
    themeToggle: required("#themeToggle"),
    themeToggleLabel: required("#themeToggleLabel"),
    fileInput: required("#fileInput"),
    fileDrop: required("#fileDrop"),
    fileName: required("#fileName"),
    fileMeta: required("#fileMeta"),
    changeFile: required("#changeFile"),
    fileError: required("#fileError"),
    fileLimit: required("#fileLimit"),
    processingStatus: required("#processingStatus"),
    processingStatusCopy: required("#processingStatusCopy"),
    outputFormat: required("#outputFormat"),
    worksheet: required("#worksheetSelect"),
    headerRow: required("#headerRowSelect"),
    inputDateOrder: required("#inputDateOrder"),
    dateFormat: required("#dateFormat"),
    dateSettingsHelp: required("#dateSettingsHelp"),
    removeEmpty: required("#removeEmpty"),
    trimWhitespace: required("#trimWhitespace"),
    deduplicate: required("#deduplicate"),
    dedupColumn: required("#dedupColumn"),
    dedupSummary: required("#dedupSummary"),
    dedupChange: required("#dedupChange"),
    dedupPicker: required("#dedupPicker"),
    validateEmail: required("#validateEmail"),
    emailColumn: required("#emailColumn"),
    emailSummary: required("#emailSummary"),
    emailChange: required("#emailChange"),
    emailPicker: required("#emailPicker"),
    normalizeDates: required("#normalizeDates"),
    dateColumn: required("#dateColumn"),
    dateSummary: required("#dateSummary"),
    dateChange: required("#dateChange"),
    datePicker: required("#datePicker"),
    insights: required("#insightsPanel"),
    beforeTable: required("#beforeTable"),
    afterTable: required("#afterTable"),
    beforeCount: required("#beforeCount"),
    afterCount: required("#afterCount"),
    changedCount: required("#changedCount"),
    emptyCount: required("#emptyCount"),
    dateCount: required("#dateCount"),
    duplicateCount: required("#duplicateCount"),
    issueCount: required("#issueCount"),
    downloadButton: required("#downloadButton"),
    downloadButtonLabel: required("#downloadButtonLabel"),
    downloadMeta: required("#downloadMeta"),
    announcer: required("#announcer"),
    formulaDialog: required("#formulaDialog"),
    formulaDialogCopy: required("#formulaDialogCopy")
};
const state = {
    headers: [
        ...SAMPLE_HEADERS
    ],
    rows: SAMPLE_ROWS.map((row)=>[
            ...row
        ]),
    rawRows: [
        [
            ...SAMPLE_HEADERS
        ],
        ...SAMPLE_ROWS.map((row)=>[
                ...row
            ])
    ],
    filename: "customers_dirty.csv",
    fileSize: null,
    sheetNames: [],
    isDemo: true,
    generatedHeaderCount: 0,
    output: [],
    manualEdits: new Map(),
    processing: false
};
const processor = new FileProcessor();
function announce(message) {
    els.announcer.textContent = "";
    window.setTimeout(()=>{
        els.announcer.textContent = message;
    }, 25);
}
const themeController = createThemeController({
    toggle: els.themeToggle,
    label: els.themeToggleLabel
}, announce);
function fileSizeLabel(bytes) {
    if (bytes === null) return "Demo data";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function optionList(select, headers, preferred) {
    const previous = select.value;
    select.replaceChildren(...headers.map((header)=>new Option(header, header)));
    const candidate = headers.includes(previous) ? previous : preferred;
    select.value = candidate || "";
}
function sampleColumn(index) {
    return state.rows.slice(0, 100).map((row)=>cellToString(row[index]).trim()).filter(Boolean);
}
function matchingColumns(type) {
    return state.headers.filter((header, index)=>{
        const values = sampleColumn(index);
        const headerMatches = type === "date" ? DATE_HEADER_HINT.test(header) : type === "email" ? EMAIL_HEADER_HINT.test(header) : DEDUP_HEADER_HINT.test(header);
        if (headerMatches) return true;
        if (values.length < 2) return false;
        if (type === "date") {
            return values.filter((value)=>parseDate(value, "YY-MM-DD", els.inputDateOrder.value).status === "valid").length / values.length >= 0.7;
        }
        if (type === "email") return values.filter(isEmail).length / values.length >= 0.7;
        return false;
    });
}
function setRuleAvailability(options) {
    const hasCandidates = options.candidates.length > 0;
    optionList(options.select, options.candidates, options.preferred);
    options.checkbox.disabled = !hasCandidates;
    if (!hasCandidates) options.checkbox.checked = false;
    if (options.resetChecked !== undefined) options.checkbox.checked = options.resetChecked && hasCandidates;
    options.summary.textContent = hasCandidates ? `Using ${options.select.value}` : options.emptyCopy;
    options.change.hidden = options.candidates.length <= 1;
    options.change.disabled = options.candidates.length <= 1;
    options.picker.hidden = true;
    options.change.setAttribute("aria-expanded", "false");
}
function configureColumns(options = {}) {
    const emailCandidates = matchingColumns("email");
    const dateCandidates = matchingColumns("date");
    const dedupCandidates = [
        ...new Set([
            ...emailCandidates,
            ...matchingColumns("dedup")
        ])
    ];
    setRuleAvailability({
        checkbox: els.deduplicate,
        select: els.dedupColumn,
        summary: els.dedupSummary,
        change: els.dedupChange,
        picker: els.dedupPicker,
        candidates: dedupCandidates,
        preferred: emailCandidates[0] ?? dedupCandidates[0] ?? "",
        resetChecked: options.resetRules ? false : undefined,
        emptyCopy: "No safe column found"
    });
    setRuleAvailability({
        checkbox: els.validateEmail,
        select: els.emailColumn,
        summary: els.emailSummary,
        change: els.emailChange,
        picker: els.emailPicker,
        candidates: emailCandidates,
        preferred: emailCandidates[0] ?? "",
        resetChecked: options.resetRules ? true : undefined,
        emptyCopy: "No email column found"
    });
    setRuleAvailability({
        checkbox: els.normalizeDates,
        select: els.dateColumn,
        summary: els.dateSummary,
        change: els.dateChange,
        picker: els.datePicker,
        candidates: dateCandidates,
        preferred: dateCandidates[0] ?? "",
        resetChecked: options.resetRules ? true : undefined,
        emptyCopy: "No date column found"
    });
}
function toggleColumnPicker(picker, button) {
    const shouldShow = picker.hidden;
    picker.hidden = !shouldShow;
    button.setAttribute("aria-expanded", String(shouldShow));
    if (shouldShow) picker.querySelector("select")?.focus();
}
function getSettings() {
    return {
        removeEmpty: els.removeEmpty.checked,
        trimWhitespace: els.trimWhitespace.checked,
        deduplicate: els.deduplicate.checked,
        dedupColumn: els.dedupColumn.value,
        validateEmail: els.validateEmail.checked,
        emailColumn: els.emailColumn.value,
        normalizeDates: els.normalizeDates.checked,
        dateColumn: els.dateColumn.value,
        inputDateOrder: els.inputDateOrder.value,
        dateFormat: els.dateFormat.value
    };
}
function syncDateSettings() {
    const hasDateRule = !els.normalizeDates.disabled;
    const enabled = hasDateRule && els.normalizeDates.checked;
    els.inputDateOrder.disabled = !enabled || state.processing;
    els.dateFormat.disabled = !enabled || state.processing;
    // Keep the hint's layout space so toggling the rule cannot shift adjacent controls.
    els.dateSettingsHelp.hidden = false;
    els.dateSettingsHelp.classList.toggle("is-concealed", enabled);
    els.dateSettingsHelp.textContent = hasDateRule ? "Enable Normalize dates to edit these settings." : "No suitable date column was found.";
}
function createInsight(text, options = {}) {
    const item = document.createElement("div");
    item.className = `insight ${options.tone ?? "info"}`;
    const copy = document.createElement("span");
    copy.textContent = text;
    item.append(copy);
    if (options.actionLabel && options.onAction) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "insight-action";
        action.textContent = options.actionLabel;
        action.addEventListener("click", options.onAction);
        item.append(action);
    }
    return item;
}
function renderInsights(result, settings) {
    const insights = [];
    if (state.generatedHeaderCount > 0) {
        const count = state.generatedHeaderCount;
        insights.push(createInsight(`${count} ${count === 1 ? "column had" : "columns had"} no header. ${count === 1 ? "A name was" : "Names were"} added so no data was lost.`, {
            tone: "info"
        }));
    }
    if (result.diagnostics.duplicateValues > 0 && !settings.deduplicate) {
        const count = result.diagnostics.duplicateValues;
        insights.push(createInsight(`${count} duplicate ${count === 1 ? "value" : "values"} found in ${settings.dedupColumn}.`, {
            tone: "warning",
            actionLabel: "Enable de-duplicate",
            onAction: ()=>{
                els.deduplicate.checked = true;
                updateUI({
                    announceChange: true
                });
            }
        }));
    }
    if (result.diagnostics.invalidEmails > 0) {
        const count = result.diagnostics.invalidEmails;
        insights.push(createInsight(`${count} ${count === 1 ? "email needs" : "emails need"} review.`, {
            tone: "warning",
            actionLabel: settings.validateEmail ? undefined : "Enable validation",
            onAction: settings.validateEmail ? undefined : ()=>{
                els.validateEmail.checked = true;
                updateUI({
                    announceChange: true
                });
            }
        }));
    }
    if (result.diagnostics.invalidDates > 0) {
        const count = result.diagnostics.invalidDates;
        insights.push(createInsight(`${count} ${count === 1 ? "date needs" : "dates need"} review.`, {
            tone: "warning",
            actionLabel: settings.normalizeDates ? undefined : "Enable date check",
            onAction: settings.normalizeDates ? undefined : ()=>{
                els.normalizeDates.checked = true;
                updateUI({
                    announceChange: true
                });
            }
        }));
    }
    els.insights.replaceChildren(...insights);
    els.insights.hidden = insights.length === 0;
}
function commitManualEdit(sourceIndex, columnIndex, nextValue) {
    try {
        assertCellLength(nextValue);
        const original = cellToString(state.rows[sourceIndex]?.[columnIndex]);
        const key = `${sourceIndex}:${columnIndex}`;
        if (nextValue === original) state.manualEdits.delete(key);
        else state.manualEdits.set(key, nextValue);
        clearFileError();
        updateUI({
            announceChange: true
        });
        return true;
    } catch (error) {
        showFileError(normalizeError(error));
        return false;
    }
}
function updateUI(options = {}) {
    syncDateSettings();
    const settings = getSettings();
    const result = cleanRows(state.headers, state.rows, settings, state.manualEdits);
    state.output = result.output;
    const tableOptions = {
        headers: state.headers,
        originalIssues: (row)=>issuesForOriginalRow(row, state.headers, settings),
        onEdit: commitManualEdit
    };
    renderTable(els.beforeTable, {
        ...tableOptions,
        rows: state.rows,
        kind: "before"
    });
    renderTable(els.afterTable, {
        ...tableOptions,
        rows: result.output,
        kind: "after"
    });
    els.beforeCount.textContent = `${state.rows.length} rows`;
    els.afterCount.textContent = `${result.output.length} rows`;
    els.changedCount.textContent = String(result.summary.changedRows);
    els.emptyCount.textContent = String(result.summary.emptyRows);
    els.dateCount.textContent = String(result.summary.normalizedDates);
    els.duplicateCount.textContent = String(result.summary.duplicateRows);
    els.issueCount.textContent = String(result.summary.invalidEmails + result.summary.invalidDates);
    const extension = els.outputFormat.value.toUpperCase();
    els.downloadMeta.textContent = `${extension} · ${result.output.length} rows · ${state.isDemo ? "demo data" : "ready to download"}`;
    renderInsights(result, settings);
    if (options.announceChange) {
        announce(`${result.output.length} cleaned rows ready. ${result.summary.invalidEmails + result.summary.invalidDates} values need review.`);
    }
}
function setFilePresentation() {
    els.fileName.textContent = state.filename;
    els.fileMeta.textContent = `${fileSizeLabel(state.fileSize)} · ${state.rows.length} rows`;
    els.changeFile.textContent = state.isDemo ? "Choose file" : "Change file";
}
function setProcessing(processing, message = "Processing file…") {
    state.processing = processing;
    els.processingStatus.hidden = !processing;
    els.processingStatusCopy.textContent = message;
    els.fileDrop.disabled = processing;
    els.fileDrop.setAttribute("aria-busy", String(processing));
    els.downloadButton.disabled = processing;
    els.worksheet.disabled = processing || state.sheetNames.length < 2;
    els.headerRow.disabled = processing || headerCandidates(state.rawRows).length < 2;
    syncDateSettings();
}
function showFileError(message) {
    els.fileError.textContent = message;
    els.fileError.hidden = false;
    announce(message);
}
function clearFileError() {
    els.fileError.textContent = "";
    els.fileError.hidden = true;
}
function populateHeaderRows(rawRows, selectedIndex) {
    const candidates = headerCandidates(rawRows);
    els.headerRow.replaceChildren(...candidates.map(({ index, preview })=>new Option(`Row ${index + 1} — ${preview}`, String(index))));
    els.headerRow.value = String(selectedIndex);
    els.headerRow.disabled = candidates.length < 2 || state.processing;
}
function adoptSheet(rawRows, headerIndex) {
    const prepared = prepareSheet(rawRows, headerIndex);
    state.headers = prepared.headers;
    state.rows = prepared.rows;
    state.generatedHeaderCount = prepared.generatedHeaderCount;
    state.manualEdits.clear();
    configureColumns({
        resetRules: true
    });
    setFilePresentation();
    updateUI({
        announceChange: true
    });
}
function loadActiveSheet(rawRows) {
    const headerIndex = findHeaderRow(rawRows);
    state.rawRows = rawRows;
    populateHeaderRows(rawRows, headerIndex);
    adoptSheet(rawRows, headerIndex);
}
function outputFormatForFile(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".csv")) return "csv";
    if (lower.endsWith(".xlsx")) return "xlsx";
    throw new Error("Choose a .csv or .xlsx file.");
}
async function loadFile(file) {
    const fileType = outputFormatForFile(file.name);
    const limit = processor.supportsBackgroundProcessing ? HOSTED_FILE_LIMIT_BYTES : LOCAL_FILE_LIMIT_BYTES;
    if (file.size > limit) {
        const limitLabel = processor.supportsBackgroundProcessing ? "50 MB" : "10 MB";
        const recovery = processor.supportsBackgroundProcessing ? "Choose a smaller file." : "Open the GitHub Pages version to process files up to 50 MB in the background.";
        throw new Error(`This file is larger than the ${limitLabel} limit for this mode. ${recovery}`);
    }
    setProcessing(true, "Reading and checking your file…");
    try {
        const buffer = await file.arrayBuffer();
        const parsed = await processor.load(fileType, buffer);
        state.filename = file.name;
        state.fileSize = file.size;
        state.isDemo = false;
        state.sheetNames = [
            ...parsed.sheetNames
        ];
        if (fileType === "csv") {
            els.worksheet.replaceChildren(new Option("Not needed for CSV", "csv"));
            els.worksheet.disabled = true;
        } else {
            els.worksheet.replaceChildren(...parsed.sheetNames.map((name)=>new Option(name, name)));
            els.worksheet.value = parsed.activeSheet ?? parsed.sheetNames[0] ?? "";
            els.worksheet.disabled = parsed.sheetNames.length < 2;
        }
        clearFileError();
        loadActiveSheet(parsed.rows);
    } finally{
        setProcessing(false);
    }
}
async function onWorksheetChange() {
    const sheetName = els.worksheet.value;
    if (!sheetName || sheetName === "csv") return;
    setProcessing(true, `Loading ${sheetName}…`);
    try {
        const rows = await processor.selectSheet(sheetName);
        clearFileError();
        loadActiveSheet(rows);
    } catch (error) {
        showFileError(normalizeError(error));
    } finally{
        setProcessing(false);
    }
}
function onHeaderRowChange() {
    try {
        adoptSheet(state.rawRows, Number(els.headerRow.value));
        clearFileError();
    } catch (error) {
        showFileError(normalizeError(error));
    }
}
function triggerDownload(buffer, mime, name) {
    const url = URL.createObjectURL(new Blob([
        buffer
    ], {
        type: mime
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
async function downloadCleaned(options = {}) {
    const rawRows = [
        state.headers,
        ...state.output.map((entry)=>entry.values)
    ];
    const rows = options.safe ? safeRows(rawRows) : rawRows.map((row)=>row.map(cellToString));
    const format = els.outputFormat.value;
    const baseName = state.filename.replace(/\.(csv|xlsx)$/i, "") || "cleaned-data";
    const originalLabel = els.downloadButtonLabel.textContent ?? "Download cleaned file";
    els.downloadButton.disabled = true;
    els.downloadButton.setAttribute("aria-busy", "true");
    els.downloadButtonLabel.textContent = "Preparing file…";
    try {
        const exported = await processor.exportRows(format, rows, Boolean(options.safe && format === "csv"));
        triggerDownload(exported.buffer, exported.mime, `${baseName}_cleaned.${exported.extension}`);
        els.downloadButton.classList.remove("is-ready");
        void els.downloadButton.offsetWidth;
        els.downloadButton.classList.add("is-ready");
        announce(options.safe ? "Your safe cleaned file download has started." : "Your cleaned file download has started.");
    } catch (error) {
        showFileError(`${normalizeError(error)} Try the download again.`);
    } finally{
        els.downloadButton.disabled = false;
        els.downloadButton.removeAttribute("aria-busy");
        els.downloadButtonLabel.textContent = originalLabel;
    }
}
function requestDownload() {
    const rows = [
        state.headers,
        ...state.output.map((entry)=>entry.values)
    ];
    const formulaCount = dangerousFormulaCount(rows);
    if (!formulaCount) {
        void downloadCleaned();
        return;
    }
    els.formulaDialogCopy.textContent = `${formulaCount} ${formulaCount === 1 ? "cell looks" : "cells look"} like spreadsheet formulas. The safe version stores them as plain text; choose original only if you trust the data.`;
    els.formulaDialog.returnValue = "";
    els.formulaDialog.showModal();
}
function handleFile(file) {
    if (!file) return;
    void loadFile(file).catch((error)=>{
        showFileError(normalizeError(error));
        els.fileInput.value = "";
        setProcessing(false);
    });
}
function bindEvents() {
    els.themeToggle.addEventListener("click", themeController.toggle);
    els.fileDrop.addEventListener("click", ()=>els.fileInput.click());
    els.fileInput.addEventListener("change", ()=>handleFile(els.fileInput.files?.[0]));
    [
        "dragenter",
        "dragover"
    ].forEach((eventName)=>els.fileDrop.addEventListener(eventName, (event)=>{
            event.preventDefault();
            if (!state.processing) els.fileDrop.classList.add("is-dragover");
        }));
    [
        "dragleave",
        "drop"
    ].forEach((eventName)=>els.fileDrop.addEventListener(eventName, (event)=>{
            event.preventDefault();
            els.fileDrop.classList.remove("is-dragover");
        }));
    els.fileDrop.addEventListener("drop", (event)=>{
        if (!state.processing) handleFile(event.dataTransfer?.files[0]);
    });
    els.worksheet.addEventListener("change", ()=>{
        void onWorksheetChange();
    });
    els.headerRow.addEventListener("change", onHeaderRowChange);
    els.outputFormat.addEventListener("change", ()=>updateUI());
    [
        els.removeEmpty,
        els.trimWhitespace,
        els.deduplicate,
        els.dedupColumn,
        els.validateEmail,
        els.emailColumn,
        els.normalizeDates,
        els.dateColumn,
        els.dateFormat
    ].forEach((control)=>control.addEventListener("change", ()=>{
            configureColumns();
            updateUI({
                announceChange: true
            });
        }));
    els.inputDateOrder.addEventListener("change", ()=>{
        configureColumns();
        updateUI({
            announceChange: true
        });
    });
    const columnPickers = [
        [
            els.dedupPicker,
            els.dedupChange
        ],
        [
            els.emailPicker,
            els.emailChange
        ],
        [
            els.datePicker,
            els.dateChange
        ]
    ];
    columnPickers.forEach(([picker, button])=>button.addEventListener("click", ()=>toggleColumnPicker(picker, button)));
    els.downloadButton.addEventListener("click", requestDownload);
    els.formulaDialog.addEventListener("close", ()=>{
        if (els.formulaDialog.returnValue === "safe") void downloadCleaned({
            safe: true
        });
        if (els.formulaDialog.returnValue === "original") void downloadCleaned();
    });
    window.addEventListener("beforeunload", ()=>{
        themeController.dispose();
        processor.dispose();
    }, {
        once: true
    });
}
function initialize() {
    els.fileLimit.textContent = processor.supportsBackgroundProcessing ? "Files up to 50 MB are processed in the background. Larger files may take longer." : "Direct-open mode supports files up to 10 MB. Use the GitHub Pages version for files up to 50 MB.";
    populateHeaderRows(state.rawRows, 0);
    themeController.initialize();
    configureColumns({
        resetRules: true
    });
    setFilePresentation();
    bindEvents();
    updateUI();
}
initialize();
return {};
})();
})();
