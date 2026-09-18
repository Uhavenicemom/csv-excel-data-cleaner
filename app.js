"use strict";
(() => {
  // src/archive.ts
  var JSZIP_SCRIPT_URL = "vendor/jszip.min.js";
  var zipLoadPromise = null;
  function loadZipConstructor() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (zipLoadPromise) return zipLoadPromise;
    const script = document.createElement("script");
    script.src = JSZIP_SCRIPT_URL;
    script.async = true;
    zipLoadPromise = new Promise((resolve, reject) => {
      script.addEventListener("load", () => {
        if (window.JSZip) resolve(window.JSZip);
        else reject(new Error("ZIP support loaded without its expected API."));
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("ZIP support could not be loaded. Reload and try again.")), { once: true });
    }).catch((error) => {
      zipLoadPromise = null;
      script.remove();
      throw error;
    });
    document.head.append(script);
    return zipLoadPromise;
  }
  async function createZip(files) {
    const Zip = await loadZipConstructor();
    const archive = new Zip();
    files.forEach(({ name, data }) => archive.file(name, typeof data === "string" ? data : new Uint8Array(data)));
    return archive.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "DOS" });
  }

  // src/value.ts
  function isValidDateObject(value) {
    return value instanceof Date && Number.isFinite(value.getTime());
  }
  function cellToString(value) {
    if (value === null || value === void 0) return "";
    if (isValidDateObject(value)) {
      const year = String(value.getFullYear()).padStart(4, "0");
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return String(value);
  }
  function isBlankRow(row) {
    return row.every((cell) => cellToString(cell).trim() === "");
  }
  function normalizeError(error) {
    return error instanceof Error ? error.message : "Something went wrong while processing this file.";
  }

  // src/limits.ts
  var DATA_LIMITS = {
    maxRows: 2e5,
    maxColumns: 256,
    maxCells: 2e6,
    maxCellCharacters: 1e5,
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
    for (const row of rows) {
      if (row.length > limits.maxColumns) {
        throw dataLimitError(`This table contains more than ${limits.maxColumns.toLocaleString("en-US")} columns.`);
      }
      cells += row.length;
      if (cells > limits.maxCells) {
        throw dataLimitError(`This table contains more than ${limits.maxCells.toLocaleString("en-US")} cells.`);
      }
      row.forEach((value) => assertCellLength(value, limits));
    }
  }

  // src/csv.ts
  var DELIMITERS = [",", ";", "	"];
  function decodeUtf8(buffer) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
    } catch {
      throw new Error("This CSV is not valid UTF-8. Save it as UTF-8 in your spreadsheet app and try again.");
    }
  }
  function detectCsvDelimiter(text) {
    const counts = new Map(DELIMITERS.map((delimiter) => [delimiter, 0]));
    let inQuotes = false;
    let lines = 0;
    for (let index = 0; index < text.length && lines < 12; index += 1) {
      const character = text.charAt(index);
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
    return [...counts.entries()].reduce((best, current) => current[1] > best[1] ? current : best, [",", 0])[0];
  }
  function csvToRows(text, limits = DATA_LIMITS) {
    const source = text.replace(/^\uFEFF/, "");
    const delimiter = detectCsvDelimiter(source);
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    let cellCount = 0;
    const pushCell = () => {
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
    const pushRow = () => {
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
  function csvEscape(value, forceQuote = false) {
    const source = cellToString(value);
    return forceQuote || /[",\n\r\t]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
  }
  function serializeCsv(rows, forceQuote = false) {
    return rows.map((row) => row.map((value) => csvEscape(value, forceQuote)).join(",")).join("\r\n");
  }

  // src/batch.ts
  var MAX_BATCH_FILES = 10;
  var MAX_BATCH_BYTES = 100 * 1024 * 1024;
  var MAX_BATCH_CELLS = 2e6;
  function validateBatchSelection(files, perFileLimit) {
    if (files.length < 2) throw new Error("Choose at least two files for batch processing.");
    if (files.length > MAX_BATCH_FILES) throw new Error(`Choose no more than ${MAX_BATCH_FILES} files at once.`);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_BATCH_BYTES) throw new Error("The selected files are larger than the 100 MB batch limit.");
    const oversized = files.find((file) => file.size > perFileLimit);
    if (oversized) throw new Error(`${oversized.name} is larger than the per-file limit for this mode.`);
  }
  function batchOutputFormat(mode, filename) {
    if (mode !== "original") return mode;
    return filename.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
  }
  function uniqueArchiveName(filename, used) {
    const match = /^(.*?)(\.[^.]+)?$/.exec(filename);
    const base = match?.[1] || "cleaned-data";
    const extension = match?.[2] || "";
    let candidate = `${base}${extension}`;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}-${suffix}${extension}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }
  function cleanupReportCsv(entries) {
    const rows = entries.map((entry) => [
      entry.filename,
      entry.status,
      String(entry.sourceRows),
      String(entry.outputRows),
      String(entry.summary?.changedRows ?? 0),
      String(entry.summary?.emptyRows ?? 0),
      String(entry.summary?.duplicateRows ?? 0),
      String(entry.summary?.normalizedDates ?? 0),
      String((entry.summary?.invalidEmails ?? 0) + (entry.summary?.possibleEmailTypos ?? 0) + (entry.summary?.invalidDates ?? 0)),
      entry.reviewReasons.join("; "),
      entry.approvedAsIs ? "Yes" : "No",
      entry.includedInZip ? "Yes" : "No"
    ]);
    return serializeCsv([[
      "File",
      "Status",
      "Source rows",
      "Output rows",
      "Rows changed",
      "Blank rows removed",
      "Duplicate rows removed",
      "Dates normalized",
      "Values to review",
      "Review notes",
      "Approved as is",
      "Included in ZIP"
    ], ...rows]);
  }

  // src/dates.ts
  var MONTHS = {
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
    if (![year, month, day].every(Number.isInteger)) return false;
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
    return isValidDateParts(parts) ? { status: "valid", value: formatDate(parts, format), parts } : { status: "invalid" };
  }
  function expandYear(year) {
    return year < 100 ? 2e3 + year : year;
  }
  function parseNumericDate(source, format, inputOrder) {
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(source)) {
      const [year, month2, day2] = source.split(/[/-]/).map(Number);
      if (year === void 0 || month2 === void 0 || day2 === void 0) return { status: "invalid" };
      return validResult({ year, month: month2, day: day2 }, format);
    }
    if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(source)) return null;
    const [first, second, rawYear] = source.split(/[/-]/).map(Number);
    if (first === void 0 || second === void 0 || rawYear === void 0) return { status: "invalid" };
    const order = first > 12 && second <= 12 ? "DD-MM-YY" : second > 12 && first <= 12 ? "MM-DD-YY" : inputOrder;
    const [month, day] = order === "MM-DD-YY" ? [first, second] : [second, first];
    return validResult({ year: expandYear(rawYear), month, day }, format);
  }
  function parseTextDate(source, format) {
    const monthFirst = source.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/i);
    const dayFirst = source.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?[,]?\s+(\d{4})$/i);
    const monthName = monthFirst?.[1] ?? dayFirst?.[2];
    const month = monthName ? MONTHS[monthName.toLowerCase()] : void 0;
    const day = Number(monthFirst?.[2] ?? dayFirst?.[1]);
    const year = Number(monthFirst?.[3] ?? dayFirst?.[3]);
    if (month === void 0 || !Number.isFinite(day) || !Number.isFinite(year)) return { status: "invalid" };
    return validResult({ year, month, day }, format);
  }
  function parseDate(value, outputFormat, inputOrder) {
    if (isValidDateObject(value)) {
      return validResult({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }, outputFormat);
    }
    const source = cellToString(value).trim();
    if (!source) return { status: "empty" };
    return parseNumericDate(source, outputFormat, inputOrder) ?? parseTextDate(source, outputFormat);
  }

  // src/email-domains.ts
  var EMAIL_TYPO_ISSUE = "Possible email typo";
  var PROVIDER_DOMAINS = [
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "yahoo.com",
    "myyahoo.com",
    "yahoo.co.uk",
    "yahoo.fr",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "protonmail.ch",
    "gmx.com",
    "mail.com",
    "fastmail.com",
    "zohomail.com",
    "aol.com"
  ];
  var knownDomains = new Set(PROVIDER_DOMAINS);
  var nearDomains = /* @__PURE__ */ new Map();
  function addVariant(variant, domain) {
    if (variant === domain || knownDomains.has(variant)) return;
    const previous = nearDomains.get(variant);
    if (previous === void 0) nearDomains.set(variant, domain);
    else if (previous !== domain) nearDomains.set(variant, null);
  }
  for (const domain of PROVIDER_DOMAINS) {
    const dot = domain.indexOf(".");
    const name = domain.slice(0, dot);
    const suffix = domain.slice(dot);
    if (name.length < 5) continue;
    for (let index = 0; index < name.length; index += 1) {
      addVariant(`${name.slice(0, index)}${name.slice(index + 1)}${suffix}`, domain);
      if (index + 1 < name.length && name.charAt(index) !== name.charAt(index + 1)) {
        addVariant(`${name.slice(0, index)}${name.charAt(index + 1)}${name.charAt(index)}${name.slice(index + 2)}${suffix}`, domain);
      }
      for (const letter of "abcdefghijklmnopqrstuvwxyz") {
        if (letter !== name.charAt(index)) {
          addVariant(`${name.slice(0, index)}${letter}${name.slice(index + 1)}${suffix}`, domain);
        }
      }
    }
    for (let index = 0; index <= name.length; index += 1) {
      for (const letter of "abcdefghijklmnopqrstuvwxyz") {
        addVariant(`${name.slice(0, index)}${letter}${name.slice(index)}${suffix}`, domain);
      }
    }
  }
  function emailCellKey(sourceIndex, columnIndex) {
    return `${sourceIndex}:${columnIndex}`;
  }
  function isDismissedEmailTypo(email, sourceIndex, columnIndex, dismissed) {
    return dismissed.get(emailCellKey(sourceIndex, columnIndex)) === email.trim().toLowerCase();
  }
  function suggestEmailDomain(email) {
    const originalEmail = email.trim();
    const at = originalEmail.lastIndexOf("@");
    if (at <= 0 || at === originalEmail.length - 1) return null;
    const domain = originalEmail.slice(at + 1).toLowerCase();
    if (knownDomains.has(domain)) return null;
    const suggestedDomain = nearDomains.get(domain);
    if (!suggestedDomain) return null;
    return {
      originalEmail,
      correctedEmail: `${originalEmail.slice(0, at + 1)}${suggestedDomain}`,
      suggestedDomain
    };
  }

  // src/cleaning.ts
  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(cellToString(value).trim());
  }
  function editedValue(original, sourceIndex, columnIndex, manualEdits) {
    return manualEdits.get(`${sourceIndex}:${columnIndex}`) ?? cellToString(original);
  }
  function prepareRows(rows, settings, manualEdits) {
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
  function duplicateCount(rows, columnIndex) {
    if (columnIndex < 0) return 0;
    const seen = /* @__PURE__ */ new Set();
    let duplicates = 0;
    rows.forEach((row) => {
      const key = (row[columnIndex] ?? "").trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) duplicates += 1;
      else seen.add(key);
    });
    return duplicates;
  }
  function diagnoseRows(headers, rows, settings, dismissedEmailTypos) {
    const dedupIndex = headers.indexOf(settings.dedupColumn);
    const emailIndex = headers.indexOf(settings.emailColumn);
    const dateIndex = headers.indexOf(settings.dateColumn);
    return {
      duplicateValues: duplicateCount(rows.map((entry) => entry.values), dedupIndex),
      invalidEmails: emailIndex < 0 ? 0 : rows.filter(({ values }) => {
        const value = (values[emailIndex] ?? "").trim();
        return Boolean(value) && !isEmail(value);
      }).length,
      possibleEmailTypos: emailIndex < 0 ? 0 : rows.filter(({ values, sourceIndex }) => {
        const value = (values[emailIndex] ?? "").trim();
        return isEmail(value) && Boolean(suggestEmailDomain(value)) && !isDismissedEmailTypo(value, sourceIndex, emailIndex, dismissedEmailTypos);
      }).length,
      invalidDates: dateIndex < 0 ? 0 : rows.filter(({ values }) => {
        const value = (values[dateIndex] ?? "").trim();
        return Boolean(value) && parseDate(value, settings.dateFormat, settings.inputDateOrder).status === "invalid";
      }).length
    };
  }
  function validateAndNormalize(values, headers, settings, sourceIndex, dismissedEmailTypos) {
    const next = [...values];
    const issues = {};
    let changed = false;
    let normalizedDate = false;
    const emailIndex = headers.indexOf(settings.emailColumn);
    const dateIndex = headers.indexOf(settings.dateColumn);
    if (settings.validateEmail && emailIndex >= 0) {
      const email = (next[emailIndex] ?? "").trim();
      if (email && !isEmail(email)) issues[emailIndex] = "Invalid email";
      else if (email && suggestEmailDomain(email) && !isDismissedEmailTypo(email, sourceIndex, emailIndex, dismissedEmailTypos)) {
        issues[emailIndex] = EMAIL_TYPO_ISSUE;
      }
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
  function cleanRows(headers, rows, settings, manualEdits, dismissedEmailTypos = /* @__PURE__ */ new Map()) {
    const prepared = prepareRows(rows, settings, manualEdits);
    const remaining = settings.removeEmpty ? prepared.filter((entry) => !isBlankRow(entry.values)) : prepared;
    const diagnostics = diagnoseRows(headers, remaining, settings, dismissedEmailTypos);
    const summary = {
      changedRows: 0,
      emptyRows: prepared.length - remaining.length,
      duplicateRows: 0,
      invalidEmails: 0,
      possibleEmailTypos: 0,
      invalidDates: 0,
      normalizedDates: 0
    };
    const dedupIndex = headers.indexOf(settings.dedupColumn);
    const seen = /* @__PURE__ */ new Set();
    const output = [];
    remaining.forEach((entry) => {
      if (settings.deduplicate && dedupIndex >= 0) {
        const key = (entry.values[dedupIndex] ?? "").trim().toLowerCase();
        if (key && seen.has(key)) {
          summary.duplicateRows += 1;
          return;
        }
        if (key) seen.add(key);
      }
      const processed = validateAndNormalize(entry.values, headers, settings, entry.sourceIndex, dismissedEmailTypos);
      const changed = entry.changed || processed.changed;
      if (changed) summary.changedRows += 1;
      if (processed.normalizedDate) summary.normalizedDates += 1;
      summary.invalidEmails += Object.values(processed.issues).filter((issue) => issue === "Invalid email").length;
      summary.possibleEmailTypos += Object.values(processed.issues).filter((issue) => issue === EMAIL_TYPO_ISSUE).length;
      summary.invalidDates += Object.values(processed.issues).filter((issue) => issue === "Invalid date").length;
      output.push({ values: processed.values, issues: processed.issues, changed, sourceIndex: entry.sourceIndex });
    });
    return { output, summary, diagnostics, preparedRows: remaining.map((entry) => entry.values) };
  }
  function issuesForOriginalRow(row, headers, settings, sourceIndex, dismissedEmailTypos) {
    const values = row.map(cellToString);
    return validateAndNormalize(values, headers, settings, sourceIndex, dismissedEmailTypos).issues;
  }

  // src/columns.ts
  var DATE_HEADER_HINT = /\b(date|day|time|created|updated|due|deadline|start|end|birth|birthday|dob|joined)\b/i;
  var EMAIL_HEADER_HINT = /\be-?mail\b/i;
  var DEDUP_HEADER_HINT = /\b(e-?mail|id|identifier|code|reference|number)\b/i;
  function sampleColumn(rows, index) {
    return rows.slice(0, 100).map((row) => cellToString(row[index]).trim()).filter(Boolean);
  }
  function matchingColumns(headers, rows, type, inputDateOrder) {
    return headers.filter((header, index) => {
      const values = sampleColumn(rows, index);
      const headerMatches = type === "date" ? DATE_HEADER_HINT.test(header) : type === "email" ? EMAIL_HEADER_HINT.test(header) : DEDUP_HEADER_HINT.test(header);
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
  function detectColumnCandidates(headers, rows, inputDateOrder) {
    const email = matchingColumns(headers, rows, "email", inputDateOrder);
    const date = matchingColumns(headers, rows, "date", inputDateOrder);
    const dedup = [.../* @__PURE__ */ new Set([...email, ...matchingColumns(headers, rows, "dedup", inputDateOrder)])];
    return { date, email, dedup };
  }

  // src/demo-data.ts
  var SAMPLE_HEADERS = ["Customer ID", "Full Name", "Email", "Sign Up Date", "Amount", "Country", "Notes"];
  var SAMPLE_ROWS = [
    ["C-1042", "  Ava Nguyen  ", " ava.nguyen@example.com ", "2025/01/04", "99.00", "USA", "First order"],
    ["C-1043", "Mateo Silva", "mateo.silva@mgail.com", "04-01-25", "149", "Brazil", "Email domain may be misspelled"],
    ["C-1044", "Priya Shah", "invalid-email", "Jan 6, 2025", "200.00", "India", "Contact before renewal"],
    ["", "", "", "", "", "", ""],
    ["C-1046", "Noah Williams", "noah.williams@example.com", "1/7/25", "99", "Canada", " "],
    ["C-1047", "Elena Rossi", "elena.rossi@example.com", "2025-01-07", "99.0", "Italy", "Customer requested VAT receipt"],
    ["C-1048", "Ava Nguyen", "ava.nguyen@example.com", "2025/01/04", "99.00", "USA", "Duplicate import"],
    ["C-1049", "Liam O'Connor", "liam.oconnor@example.com", "13/01/2025", "250", "Ireland", "Priority account"],
    ["C-1050", "Samira Khan", "samira.khan@example.com", "01-08-2025", "175", "United Arab Emirates", "Check preferred language"],
    ["C-1051", "Ryo Tanaka", "ryo.tanaka@example.com", "Jan 9 2025", "300", "Japan", "Renewal in Q1"],
    ["C-1052", "Mira Chen", "mira.chen@example.com", "not-a-date", "80", "Singapore", "Missing source format"],
    ["C-1053", "Theo Martin", "theo.martin@example.com", "31/02/2025", "125", "France", "Date typed manually"],
    ["C-1054", "Lina Petrov", "lina.petrov@example.com", "2025/01/15", "=SUM(80, 45)", "Ukraine", "Formula-like amount"],
    ["C-1055", "Dev Patel", "dev.patel@example", "15 Jan 2025", "199.95", "India", "Email needs review"],
    ["C-1056", "  Chloe Martin", " chloe.martin@outlok.com", "2025/01/16", "149.50", "Czechia", "Email domain may be misspelled"],
    ["C-1057", "Nia Brooks", "nia.brooks@example.com", "2025-01-17", "220", "USA", " "],
    ["C-1058", "Carlos Torres", "ryo.tanaka@example.com", "17/01/2025", "300", "Mexico", "Duplicate email"]
  ];

  // src/sheets.ts
  var HEADER_SCAN_LIMIT = 20;
  function uniqueHeaders(headerRow) {
    const seen = /* @__PURE__ */ new Map();
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
  function prepareSheet(rawRows, headerIndex) {
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
  function rowPreview(row) {
    return row.map(cellToString).map((value) => value.trim()).filter(Boolean).slice(0, 3).join(" \xB7 ").slice(0, 54) || "Empty row";
  }
  function headerCandidates(rawRows) {
    return rawRows.slice(0, HEADER_SCAN_LIMIT).map((row, index) => ({
      index,
      nonEmpty: row.filter((cell) => cellToString(cell).trim()).length,
      preview: rowPreview(row)
    })).filter((candidate) => candidate.nonEmpty > 0);
  }
  function findHeaderRow(rawRows) {
    const candidates = headerCandidates(rawRows);
    if (!candidates.length) throw new Error("This worksheet is empty.");
    return candidates[0]?.index ?? 0;
  }
  function hasXlsxSignature(buffer) {
    const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
    return bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && (bytes[2] === 3 && bytes[3] === 4 || bytes[2] === 5 && bytes[3] === 6 || bytes[2] === 7 && bytes[3] === 8);
  }

  // src/xlsx.ts
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
    if (!sheet) throw new Error(`Worksheet \u201C${sheetName}\u201D could not be found.`);
    const range = typeof sheet === "object" && sheet !== null && "!ref" in sheet ? sheet["!ref"] : void 0;
    if (typeof range === "string") {
      const decoded = api.utils.decode_range(range);
      const rows2 = decoded.e.r - decoded.s.r + 1;
      const columns = decoded.e.c - decoded.s.c + 1;
      if (rows2 > DATA_LIMITS.maxRows) {
        throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxRows.toLocaleString("en-US")} rows.`);
      }
      if (columns > DATA_LIMITS.maxColumns) {
        throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxColumns.toLocaleString("en-US")} columns.`);
      }
      if (rows2 * columns > DATA_LIMITS.maxCells) {
        throw dataLimitError(`This worksheet contains more than ${DATA_LIMITS.maxCells.toLocaleString("en-US")} cells.`);
      }
    }
    const rows = api.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    assertTableLimits(rows);
    return rows;
  }
  function writeWorkbook(api, rows) {
    assertTableLimits(rows);
    const workbook = api.utils.book_new();
    const sheet = api.utils.aoa_to_sheet(rows);
    api.utils.book_append_sheet(workbook, sheet, "Cleaned data");
    const result = api.write(workbook, { bookType: "xlsx", type: "array" });
    if (result instanceof ArrayBuffer || Object.prototype.toString.call(result) === "[object ArrayBuffer]") {
      return result.slice(0);
    }
    if (ArrayBuffer.isView(result)) {
      return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
    }
    throw new Error("The Excel export returned an unsupported binary format.");
  }

  // src/file-processor.ts
  var HOSTED_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
  var LOCAL_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
  var XLSX_SCRIPT_URL = "vendor/xlsx.full.min.js";
  var xlsxLoadPromise = null;
  function loadMainThreadXlsx() {
    if (window.XLSX) return Promise.resolve(requireXlsx(window.XLSX));
    if (xlsxLoadPromise) return xlsxLoadPromise;
    const script = document.createElement("script");
    script.src = XLSX_SCRIPT_URL;
    script.async = true;
    xlsxLoadPromise = new Promise((resolve, reject) => {
      script.addEventListener("load", () => {
        try {
          resolve(requireXlsx(window.XLSX));
        } catch (error) {
          reject(error);
        }
      }, { once: true });
      script.addEventListener("error", () => {
        reject(new Error("Excel support could not be loaded. Reload the page and try again."));
      }, { once: true });
    }).catch((error) => {
      xlsxLoadPromise = null;
      script.remove();
      throw error;
    });
    document.head.append(script);
    return xlsxLoadPromise;
  }
  var FileProcessor = class {
    worker = null;
    directWorkbook = null;
    requestId = 0;
    pending = /* @__PURE__ */ new Map();
    get supportsBackgroundProcessing() {
      return window.location.protocol !== "file:" && "Worker" in window;
    }
    destroyWorker(error = new Error("Background processing was stopped.")) {
      this.worker?.terminate();
      this.worker = null;
      this.pending.forEach(({ reject, timer }) => {
        window.clearTimeout(timer);
        reject(error);
      });
      this.pending.clear();
    }
    ensureWorker() {
      if (this.worker) return this.worker;
      const worker = new Worker("xlsx-worker.js?v=2");
      worker.addEventListener("message", (event) => {
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        this.pending.delete(event.data.id);
        window.clearTimeout(pending.timer);
        if (event.data.ok) pending.resolve(event.data);
        else pending.reject(new Error(event.data.error));
      });
      worker.addEventListener("error", () => {
        this.destroyWorker(new Error("Background processing could not start in this browser."));
      });
      this.worker = worker;
      return worker;
    }
    callWorker(message, transfer = []) {
      const worker = this.ensureWorker();
      const id = ++this.requestId;
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          this.destroyWorker(new Error("Background processing took too long and was stopped."));
        }, 3e4);
        this.pending.set(id, { resolve, reject, timer });
        try {
          worker.postMessage({ id, ...message }, transfer);
        } catch (error) {
          window.clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(normalizeError(error)));
        }
      });
    }
    async loadDirect(fileType, buffer) {
      if (fileType === "csv") {
        return { rows: csvToRows(decodeUtf8(buffer)), sheetNames: [], activeSheet: null, usedWorker: false };
      }
      if (!hasXlsxSignature(buffer)) throw new Error("This file does not appear to be a valid .xlsx workbook.");
      const api = await loadMainThreadXlsx();
      this.directWorkbook = readWorkbook(api, buffer);
      const activeSheet = this.directWorkbook.SheetNames[0] ?? null;
      if (!activeSheet) throw new Error("This Excel file has no worksheets.");
      return {
        rows: sheetRows(api, this.directWorkbook, activeSheet),
        sheetNames: [...this.directWorkbook.SheetNames],
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
        const response = await this.callWorker({ type: "parse", fileType, buffer }, [buffer]);
        if (!response.ok || response.type !== "parse") throw new Error("The background processor returned an unexpected response.");
        return { rows: response.rows, sheetNames: response.sheetNames, activeSheet: response.activeSheet, usedWorker: true };
      } catch (error) {
        this.destroyWorker(new Error("Background processing failed and was stopped."));
        throw new Error(`${normalizeError(error)} The file was not processed. Try a smaller file or reload the page.`);
      }
    }
    async selectSheet(sheetName) {
      if (this.worker) {
        const response = await this.callWorker({ type: "sheet", sheetName });
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
          const response = await this.callWorker({ type: "export", format, rows, quoteAll });
          if (!response.ok || response.type !== "export") throw new Error("The exported file could not be prepared.");
          return { buffer: response.buffer, mime: response.mime, extension: response.extension };
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
      return { buffer, mime: "text/csv;charset=utf-8", extension: "csv" };
    }
    dispose() {
      this.destroyWorker(new Error("The page was closed before background processing finished."));
      this.directWorkbook = null;
    }
  };

  // src/presets.ts
  var MAX_NAMED_PRESETS = 5;
  var PRESET_NAME_LIMIT = 40;
  var PRESET_STORAGE_KEY = "data-cleaner-presets-v1";
  var DEFAULT_PRESET = {
    removeEmpty: true,
    trimWhitespace: true,
    deduplicate: false,
    validateEmail: true,
    normalizeDates: true,
    inputDateOrder: "DD-MM-YY",
    dateFormat: "DD-MM-YY",
    batchOutputMode: "original"
  };
  function isInputDateOrder(value) {
    return value === "DD-MM-YY" || value === "MM-DD-YY";
  }
  function isOutputDateFormat(value) {
    return isInputDateOrder(value) || value === "YY-MM-DD";
  }
  function isBatchOutputMode(value) {
    return value === "original" || value === "csv" || value === "xlsx";
  }
  function normalizePresetSettings(value) {
    if (!value || typeof value !== "object") return { ...DEFAULT_PRESET };
    const candidate = value;
    return {
      removeEmpty: typeof candidate.removeEmpty === "boolean" ? candidate.removeEmpty : DEFAULT_PRESET.removeEmpty,
      trimWhitespace: typeof candidate.trimWhitespace === "boolean" ? candidate.trimWhitespace : DEFAULT_PRESET.trimWhitespace,
      deduplicate: typeof candidate.deduplicate === "boolean" ? candidate.deduplicate : DEFAULT_PRESET.deduplicate,
      validateEmail: typeof candidate.validateEmail === "boolean" ? candidate.validateEmail : DEFAULT_PRESET.validateEmail,
      normalizeDates: typeof candidate.normalizeDates === "boolean" ? candidate.normalizeDates : DEFAULT_PRESET.normalizeDates,
      inputDateOrder: isInputDateOrder(candidate.inputDateOrder) ? candidate.inputDateOrder : DEFAULT_PRESET.inputDateOrder,
      dateFormat: isOutputDateFormat(candidate.dateFormat) ? candidate.dateFormat : DEFAULT_PRESET.dateFormat,
      batchOutputMode: isBatchOutputMode(candidate.batchOutputMode) ? candidate.batchOutputMode : DEFAULT_PRESET.batchOutputMode
    };
  }
  function validNamedPreset(value) {
    if (!value || typeof value !== "object") return null;
    const candidate = value;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;
    const name = candidate.name.trim().slice(0, PRESET_NAME_LIMIT);
    if (!candidate.id || !name) return null;
    return { id: candidate.id, name, settings: normalizePresetSettings(candidate.settings) };
  }
  function emptyPresetStore() {
    return { version: 1, lastUsed: { ...DEFAULT_PRESET }, named: [] };
  }
  function parsePresetStore(serialized) {
    if (!serialized) return emptyPresetStore();
    try {
      const value = JSON.parse(serialized);
      if (value.version !== 1 || !Array.isArray(value.named)) return emptyPresetStore();
      const named = value.named.map(validNamedPreset).filter((preset) => preset !== null);
      const unique = named.filter((preset, index) => named.findIndex((entry) => entry.name.toLowerCase() === preset.name.toLowerCase()) === index);
      return {
        version: 1,
        lastUsed: normalizePresetSettings(value.lastUsed),
        named: unique.slice(0, MAX_NAMED_PRESETS)
      };
    } catch {
      return emptyPresetStore();
    }
  }
  function readPresetStore(storage) {
    return parsePresetStore(storage.getItem(PRESET_STORAGE_KEY));
  }
  function writePresetStore(storage, store) {
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
  }
  function upsertNamedPreset(store, nameSource, settings) {
    const name = nameSource.trim().slice(0, PRESET_NAME_LIMIT);
    if (!name) throw new Error("Enter a preset name.");
    const matching = store.named.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    if (!matching && store.named.length >= MAX_NAMED_PRESETS) {
      throw new Error(`You can save up to ${MAX_NAMED_PRESETS} presets. Delete one before adding another.`);
    }
    const nextPreset = matching ? { ...matching, name, settings: { ...settings } } : { id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, settings: { ...settings } };
    const named = matching ? store.named.map((preset) => preset.id === matching.id ? nextPreset : preset) : [...store.named, nextPreset];
    return { version: 1, lastUsed: { ...settings }, named };
  }
  function deleteNamedPreset(store, id) {
    return { ...store, named: store.named.filter((preset) => preset.id !== id) };
  }

  // src/security.ts
  var FORMULA_PREFIX = /^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u;
  function isFormulaLike(value) {
    return FORMULA_PREFIX.test(cellToString(value));
  }
  function dangerousFormulaCount(rows) {
    return rows.reduce((total, row) => total + row.filter(isFormulaLike).length, 0);
  }
  function makeSpreadsheetSafe(value) {
    const source = cellToString(value);
    return isFormulaLike(source) ? `'${source}` : source;
  }
  function safeRows(rows) {
    return rows.map((row) => row.map(makeSpreadsheetSafe));
  }

  // src/table-view.ts
  var VIRTUAL_ROW_BUFFER = 12;
  var virtualTables = /* @__PURE__ */ new WeakMap();
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
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        editor.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        editor.textContent = value;
        editor.blur();
      }
    });
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      insertPlainText(editor, event.clipboardData?.getData("text/plain") ?? "");
    });
    editor.addEventListener("blur", () => {
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
    headers.forEach((header) => {
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
    const issues = cleaned ? entry.issues : options.originalIssues(entry, sourceIndex);
    const row = document.createElement("tr");
    row.setAttribute("aria-rowindex", String(visibleIndex + 2));
    const number = document.createElement("td");
    number.textContent = String(sourceIndex + 1);
    row.append(number);
    values.forEach((value, columnIndex) => {
      const cell = document.createElement("td");
      const display = cellToString(value);
      if (options.kind === "after" && cleaned) {
        cell.append(makeEditableCell(display, entry, columnIndex, options));
      } else {
        cell.textContent = display || "\u2014";
      }
      const issueText = issues[columnIndex];
      if (issueText) {
        cell.classList.add("warning");
        const issue = document.createElement("span");
        issue.className = "issue";
        issue.textContent = issueText === EMAIL_TYPO_ISSUE ? "Possible typo" : issueText;
        cell.append(issue);
        if (options.kind === "after" && cleaned && issueText === EMAIL_TYPO_ISSUE) {
          const suggestion = suggestEmailDomain(display);
          if (suggestion) {
            const review = document.createElement("button");
            review.type = "button";
            review.className = "typo-review";
            review.textContent = "Review";
            review.setAttribute("aria-label", `Review possible email typo in row ${sourceIndex + 1}, ${options.headers[columnIndex] ?? "Email"}`);
            review.addEventListener("click", () => {
              options.onEmailSuggestion(sourceIndex, columnIndex, suggestion.originalEmail, suggestion.correctedEmail);
            });
            cell.append(review);
          }
        }
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
    const controller = { frame: 0, handleScroll: () => void 0, observer: null };
    const renderVisibleRows = () => {
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
      options.rows.slice(start, end).forEach((entry, index) => {
        body.append(createDataRow(entry, start + index, options));
      });
      if (end < options.rows.length) {
        body.append(createSpacerRow((options.rows.length - end) * rowHeight, options.headers.length));
      }
      table.tBodies[0]?.replaceWith(body);
      if (!table.tBodies[0]) table.append(body);
    };
    controller.handleScroll = () => {
      if (controller.frame) return;
      controller.frame = window.requestAnimationFrame(() => {
        controller.frame = 0;
        renderVisibleRows();
      });
    };
    if ("ResizeObserver" in window) {
      controller.observer = new ResizeObserver(controller.handleScroll);
      controller.observer.observe(scroll);
    }
    virtualTables.set(table, controller);
    scroll.addEventListener("scroll", controller.handleScroll, { passive: true });
    renderVisibleRows();
  }

  // src/theme.ts
  var THEME_STORAGE_KEY = "data-cleaner-theme";
  function savedTheme() {
    try {
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return theme === "dark" || theme === "light" ? theme : null;
    } catch {
      return null;
    }
  }
  function systemTheme() {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function createThemeController(elements, announce2) {
    const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = (theme, options = {}) => {
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
        } catch {
        }
      }
      if (options.announceChange) announce2(`${isDark ? "Dark" : "Light"} theme enabled.`);
    };
    const onSystemThemeChange = (event) => {
      if (!savedTheme()) apply(event.matches ? "dark" : "light");
    };
    return {
      initialize() {
        const initial = document.documentElement.dataset.theme;
        apply(initial === "dark" || initial === "light" ? initial : savedTheme() ?? systemTheme());
        preference?.addEventListener("change", onSystemThemeChange);
      },
      toggle() {
        apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark", {
          save: true,
          announceChange: true
        });
      },
      dispose() {
        preference?.removeEventListener("change", onSystemThemeChange);
      }
    };
  }

  // src/main.ts
  function required(selector) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Required interface element is missing: ${selector}`);
    return element;
  }
  var els = {
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
    presetSelect: required("#presetSelect"),
    presetSave: required("#presetSave"),
    presetDelete: required("#presetDelete"),
    presetReset: required("#presetReset"),
    presetForm: required("#presetForm"),
    presetName: required("#presetName"),
    presetCancel: required("#presetCancel"),
    batchPanel: required("#batchPanel"),
    batchSummary: required("#batchSummary"),
    batchQueue: required("#batchQueue"),
    batchOutputMode: required("#batchOutputMode"),
    batchCancel: required("#batchCancel"),
    batchReviewActions: required("#batchReviewActions"),
    batchReviewCopy: required("#batchReviewCopy"),
    batchConfirmSheet: required("#batchConfirmSheet"),
    batchSafeExport: required("#batchSafeExport"),
    batchRetry: required("#batchRetry"),
    batchApprove: required("#batchApprove"),
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
    formulaDialogCopy: required("#formulaDialogCopy"),
    emailTypoDialog: required("#emailTypoDialog"),
    emailTypoDialogCopy: required("#emailTypoDialogCopy")
  };
  var state = {
    headers: [...SAMPLE_HEADERS],
    rows: SAMPLE_ROWS.map((row) => [...row]),
    rawRows: [[...SAMPLE_HEADERS], ...SAMPLE_ROWS.map((row) => [...row])],
    filename: "customers_dirty.csv",
    fileSize: null,
    sheetNames: [],
    isDemo: true,
    generatedHeaderCount: 0,
    output: [],
    manualEdits: /* @__PURE__ */ new Map(),
    dismissedEmailTypos: /* @__PURE__ */ new Map(),
    processing: false,
    activeBatchId: null,
    batchItems: [],
    stopBatch: false
  };
  var processor = new FileProcessor();
  var presetStore = emptyPresetStore();
  var activePresetSettings = { ...DEFAULT_PRESET };
  var pendingEmailSuggestion = null;
  function announce(message) {
    els.announcer.textContent = "";
    window.setTimeout(() => {
      els.announcer.textContent = message;
    }, 25);
  }
  var themeController = createThemeController({
    toggle: els.themeToggle,
    label: els.themeToggleLabel
  }, announce);
  function fileSizeLabel(bytes) {
    if (bytes === null) return "Demo data";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  function currentPresetSettings() {
    return {
      removeEmpty: els.removeEmpty.checked,
      trimWhitespace: els.trimWhitespace.checked,
      deduplicate: els.deduplicate.disabled ? activePresetSettings.deduplicate : els.deduplicate.checked,
      validateEmail: els.validateEmail.disabled ? activePresetSettings.validateEmail : els.validateEmail.checked,
      normalizeDates: els.normalizeDates.disabled ? activePresetSettings.normalizeDates : els.normalizeDates.checked,
      inputDateOrder: els.inputDateOrder.value,
      dateFormat: els.dateFormat.value,
      batchOutputMode: els.batchOutputMode.value
    };
  }
  function persistPresetStore(options = {}) {
    try {
      writePresetStore(window.localStorage, presetStore);
    } catch {
      if (!options.quiet) announce("Settings could not be stored in this browser. They still apply to this tab.");
    }
  }
  function rememberLastUsed() {
    activePresetSettings = currentPresetSettings();
    presetStore = { ...presetStore, lastUsed: { ...activePresetSettings } };
    persistPresetStore({ quiet: true });
  }
  function renderPresetOptions(selected = els.presetSelect.value || "last-used") {
    els.presetSelect.replaceChildren(
      new Option("Last used", "last-used"),
      ...presetStore.named.map((preset) => new Option(preset.name, preset.id))
    );
    els.presetSelect.value = presetStore.named.some((preset) => preset.id === selected) ? selected : "last-used";
    els.presetDelete.disabled = els.presetSelect.value === "last-used";
  }
  function applyPresetToControls(settings) {
    activePresetSettings = { ...settings };
    els.removeEmpty.checked = settings.removeEmpty;
    els.trimWhitespace.checked = settings.trimWhitespace;
    els.deduplicate.checked = settings.deduplicate;
    els.validateEmail.checked = settings.validateEmail;
    els.normalizeDates.checked = settings.normalizeDates;
    els.inputDateOrder.value = settings.inputDateOrder;
    els.dateFormat.value = settings.dateFormat;
    els.batchOutputMode.value = settings.batchOutputMode;
    configureColumns();
    els.deduplicate.checked = settings.deduplicate && !els.deduplicate.disabled;
    els.validateEmail.checked = settings.validateEmail && !els.validateEmail.disabled;
    els.normalizeDates.checked = settings.normalizeDates && !els.normalizeDates.disabled;
  }
  function cleaningSettingsFor(preset, candidates, existing) {
    const selectCandidate = (values, previous) => previous && values.includes(previous) ? previous : values[0] ?? "";
    return {
      removeEmpty: preset.removeEmpty,
      trimWhitespace: preset.trimWhitespace,
      deduplicate: preset.deduplicate && candidates.dedup.length > 0,
      dedupColumn: selectCandidate(candidates.dedup, existing?.dedupColumn),
      validateEmail: preset.validateEmail && candidates.email.length > 0,
      emailColumn: selectCandidate(candidates.email, existing?.emailColumn),
      normalizeDates: preset.normalizeDates && candidates.date.length > 0,
      dateColumn: selectCandidate(candidates.date, existing?.dateColumn),
      inputDateOrder: preset.inputDateOrder,
      dateFormat: preset.dateFormat
    };
  }
  function optionList(select, headers, preferred) {
    const previous = select.value;
    select.replaceChildren(...headers.map((header) => new Option(header, header)));
    const candidate = headers.includes(previous) ? previous : preferred;
    select.value = candidate || "";
  }
  function setRuleAvailability(options) {
    const hasCandidates = options.candidates.length > 0;
    optionList(options.select, options.candidates, options.preferred);
    options.checkbox.disabled = !hasCandidates;
    if (!hasCandidates) options.checkbox.checked = false;
    if (options.resetChecked !== void 0) options.checkbox.checked = options.resetChecked && hasCandidates;
    options.summary.textContent = hasCandidates ? `Using ${options.select.value}` : options.emptyCopy;
    options.change.hidden = options.candidates.length <= 1;
    options.change.disabled = options.candidates.length <= 1;
    options.picker.hidden = true;
    options.change.setAttribute("aria-expanded", "false");
  }
  function configureColumns(options = {}) {
    const candidates = detectColumnCandidates(
      state.headers,
      state.rows,
      els.inputDateOrder.value
    );
    const emailCandidates = candidates.email;
    const dateCandidates = candidates.date;
    const dedupCandidates = candidates.dedup;
    setRuleAvailability({
      checkbox: els.deduplicate,
      select: els.dedupColumn,
      summary: els.dedupSummary,
      change: els.dedupChange,
      picker: els.dedupPicker,
      candidates: dedupCandidates,
      preferred: emailCandidates[0] ?? dedupCandidates[0] ?? "",
      resetChecked: options.resetRules ? false : void 0,
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
      resetChecked: options.resetRules ? true : void 0,
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
      resetChecked: options.resetRules ? true : void 0,
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
      insights.push(createInsight(`${count} ${count === 1 ? "column had" : "columns had"} no header. ${count === 1 ? "A name was" : "Names were"} added so no data was lost.`, { tone: "info" }));
    }
    if (result.diagnostics.duplicateValues > 0 && !settings.deduplicate) {
      const count = result.diagnostics.duplicateValues;
      insights.push(createInsight(`${count} duplicate ${count === 1 ? "value" : "values"} found in ${settings.dedupColumn}.`, {
        tone: "warning",
        actionLabel: "Enable de-duplicate",
        onAction: () => {
          els.deduplicate.checked = true;
          updateUI({ announceChange: true });
        }
      }));
    }
    if (result.diagnostics.invalidEmails > 0) {
      const count = result.diagnostics.invalidEmails;
      insights.push(createInsight(`${count} ${count === 1 ? "email needs" : "emails need"} review.`, {
        tone: "warning",
        actionLabel: settings.validateEmail ? void 0 : "Enable validation",
        onAction: settings.validateEmail ? void 0 : () => {
          els.validateEmail.checked = true;
          updateUI({ announceChange: true });
        }
      }));
    }
    if (result.diagnostics.possibleEmailTypos > 0) {
      const count = result.diagnostics.possibleEmailTypos;
      insights.push(createInsight(`${count} possible email ${count === 1 ? "domain typo" : "domain typos"} to review.`, {
        tone: "warning",
        actionLabel: settings.validateEmail ? void 0 : "Enable email check",
        onAction: settings.validateEmail ? void 0 : () => {
          els.validateEmail.checked = true;
          updateUI({ announceChange: true });
        }
      }));
    }
    if (result.diagnostics.invalidDates > 0) {
      const count = result.diagnostics.invalidDates;
      insights.push(createInsight(`${count} ${count === 1 ? "date needs" : "dates need"} review.`, {
        tone: "warning",
        actionLabel: settings.normalizeDates ? void 0 : "Enable date check",
        onAction: settings.normalizeDates ? void 0 : () => {
          els.normalizeDates.checked = true;
          updateUI({ announceChange: true });
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
      state.dismissedEmailTypos.delete(key);
      if (nextValue === original) state.manualEdits.delete(key);
      else state.manualEdits.set(key, nextValue);
      clearFileError();
      updateUI({ announceChange: true });
      return true;
    } catch (error) {
      showFileError(normalizeError(error));
      return false;
    }
  }
  function reviewEmailSuggestion(sourceIndex, columnIndex, originalEmail, correctedEmail) {
    if (state.processing) return;
    pendingEmailSuggestion = { sourceIndex, columnIndex, originalEmail, correctedEmail };
    els.emailTypoDialogCopy.textContent = `Keep ${originalEmail}, or use ${correctedEmail}. This is a suggestion, not a confirmed error.`;
    els.emailTypoDialog.returnValue = "";
    els.emailTypoDialog.showModal();
  }
  function finishEmailSuggestionReview() {
    const pending = pendingEmailSuggestion;
    pendingEmailSuggestion = null;
    if (!pending) return;
    if (els.emailTypoDialog.returnValue === "use") {
      if (commitManualEdit(pending.sourceIndex, pending.columnIndex, pending.correctedEmail)) {
        announce(`Email changed to ${pending.correctedEmail}.`);
        els.afterTable.closest(".table-scroll")?.focus();
      }
    } else if (els.emailTypoDialog.returnValue === "keep") {
      state.dismissedEmailTypos.set(
        emailCellKey(pending.sourceIndex, pending.columnIndex),
        pending.originalEmail.toLowerCase()
      );
      updateUI({ announceChange: true });
      announce(`Kept ${pending.originalEmail} for this file.`);
      els.afterTable.closest(".table-scroll")?.focus();
    }
  }
  function activeBatchItem() {
    return state.batchItems.find((item) => item.id === state.activeBatchId) ?? null;
  }
  function reviewReasonsFor(item, result, preset) {
    const reasons = [];
    if (item.sheetNames.length > 1 && !item.sheetConfirmed) reasons.push("Confirm the worksheet");
    if (preset.deduplicate && item.columnCandidates.dedup.length === 0) reasons.push("No duplicate-key column was detected");
    if (preset.validateEmail && item.columnCandidates.email.length === 0) reasons.push("No email column was detected");
    if (preset.normalizeDates && item.columnCandidates.date.length === 0) reasons.push("No date column was detected");
    if (preset.deduplicate && item.columnCandidates.dedup.length > 1 && !item.confirmedColumns.dedup) reasons.push("Choose the duplicate-key column");
    if (preset.validateEmail && item.columnCandidates.email.length > 1 && !item.confirmedColumns.email) reasons.push("Choose the email column");
    if (preset.normalizeDates && item.columnCandidates.date.length > 1 && !item.confirmedColumns.date) reasons.push("Choose the date column");
    if (!preset.deduplicate && result.diagnostics.duplicateValues > 0) {
      reasons.push(`${result.diagnostics.duplicateValues} duplicate ${result.diagnostics.duplicateValues === 1 ? "value" : "values"} detected`);
    }
    if (result.summary.invalidEmails > 0) reasons.push(`${result.summary.invalidEmails} invalid ${result.summary.invalidEmails === 1 ? "email" : "emails"}`);
    if (result.summary.possibleEmailTypos > 0) reasons.push(`${result.summary.possibleEmailTypos} possible email ${result.summary.possibleEmailTypos === 1 ? "typo" : "typos"}`);
    if (result.summary.invalidDates > 0) reasons.push(`${result.summary.invalidDates} invalid ${result.summary.invalidDates === 1 ? "date" : "dates"}`);
    const formulaCount = dangerousFormulaCount([item.headers, ...result.output.map((entry) => entry.values)]);
    if (formulaCount > 0 && !item.safeExport) reasons.push(`${formulaCount} formula-like ${formulaCount === 1 ? "cell" : "cells"}`);
    return reasons;
  }
  function applyBatchEvaluation(item, result, settings, preset) {
    item.settings = settings;
    item.output = result.output;
    item.summary = result.summary;
    item.reviewReasons = reviewReasonsFor(item, result, preset);
    if (item.status === "cancelled" || item.status === "failed") return;
    item.status = item.approvedAsIs || item.reviewReasons.length === 0 ? "ready" : "needs-review";
    item.statusMessage = item.status === "ready" ? `${result.output.length} cleaned rows` : item.reviewReasons.join(" \xB7 ");
  }
  function evaluateBatchItem(item, preset = currentPresetSettings()) {
    item.settings = cleaningSettingsFor(preset, item.columnCandidates, item.settings);
    const result = cleanRows(item.headers, item.rows, item.settings, item.manualEdits, item.dismissedEmailTypos);
    applyBatchEvaluation(item, result, item.settings, preset);
  }
  var STATUS_LABELS = {
    queued: "Queued",
    processing: "Processing",
    ready: "Ready",
    "needs-review": "Needs review",
    failed: "Failed",
    cancelled: "Cancelled"
  };
  function renderBatchPanel() {
    const inBatch = state.batchItems.length > 1;
    els.batchPanel.hidden = !inBatch;
    if (!inBatch) return;
    const ready = state.batchItems.filter((item) => item.status === "ready").length;
    const review = state.batchItems.filter((item) => item.status === "needs-review").length;
    const failed = state.batchItems.filter((item) => item.status === "failed").length;
    els.batchSummary.textContent = `${state.batchItems.length} files \xB7 ${ready} ready \xB7 ${review} need review${failed ? ` \xB7 ${failed} failed` : ""}`;
    els.batchQueue.replaceChildren(...state.batchItems.map((item) => {
      const row = document.createElement("div");
      row.className = "batch-row";
      row.setAttribute("role", "listitem");
      const select = document.createElement("button");
      select.type = "button";
      select.className = "batch-item";
      select.setAttribute("aria-current", String(item.id === state.activeBatchId));
      select.disabled = state.processing || item.status === "queued" || item.status === "processing";
      const copy = document.createElement("span");
      copy.className = "batch-item-copy";
      const name = document.createElement("strong");
      name.textContent = item.file.name;
      const detail = document.createElement("small");
      detail.textContent = item.statusMessage || fileSizeLabel(item.file.size);
      copy.append(name, detail);
      const status = document.createElement("span");
      status.className = "batch-status";
      status.dataset.status = item.status;
      status.textContent = STATUS_LABELS[item.status];
      select.append(copy, status);
      select.addEventListener("click", () => selectBatchItem(item.id));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "batch-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${item.file.name} from batch`);
      remove.disabled = state.processing || item.status === "processing";
      remove.addEventListener("click", () => removeBatchItem(item.id));
      row.append(select, remove);
      return row;
    }));
    els.batchCancel.disabled = !state.processing || state.stopBatch;
    const active = activeBatchItem();
    const showActions = Boolean(active && (active.status === "needs-review" || active.status === "failed"));
    els.batchReviewActions.hidden = !showActions;
    if (!active || !showActions) return;
    els.batchReviewCopy.textContent = active.status === "failed" ? active.statusMessage : `Review ${active.file.name}: ${active.reviewReasons.join(" \xB7 ")}.`;
    els.batchConfirmSheet.hidden = !(active.sheetNames.length > 1 && !active.sheetConfirmed);
    const formulaReason = active.reviewReasons.some((reason) => reason.includes("formula-like"));
    els.batchSafeExport.hidden = !formulaReason;
    els.batchRetry.hidden = active.status !== "failed";
    els.batchApprove.hidden = active.status === "failed";
  }
  function hydrateFromBatchItem(item) {
    state.activeBatchId = item.id;
    state.headers = item.headers;
    state.rows = item.rows;
    state.rawRows = item.rawRows;
    state.filename = item.file.name;
    state.fileSize = item.file.size;
    state.sheetNames = item.sheetNames;
    state.isDemo = false;
    state.generatedHeaderCount = item.generatedHeaderCount;
    state.output = item.output;
    state.manualEdits = item.manualEdits;
    state.dismissedEmailTypos = item.dismissedEmailTypos;
    populateHeaderRows(item.rawRows, item.headerIndex);
    if (item.sourceFormat === "csv") {
      els.worksheet.replaceChildren(new Option("Not needed for CSV", "csv"));
      els.worksheet.disabled = true;
    } else {
      els.worksheet.replaceChildren(...item.sheetNames.map((name) => new Option(name, name)));
      els.worksheet.value = item.activeSheet ?? item.sheetNames[0] ?? "";
      els.worksheet.disabled = item.sheetNames.length < 2;
    }
    els.inputDateOrder.value = item.settings.inputDateOrder;
    els.dateFormat.value = item.settings.dateFormat;
    els.removeEmpty.checked = item.settings.removeEmpty;
    els.trimWhitespace.checked = item.settings.trimWhitespace;
    els.deduplicate.checked = item.settings.deduplicate;
    els.validateEmail.checked = item.settings.validateEmail;
    els.normalizeDates.checked = item.settings.normalizeDates;
    configureColumns();
    if (item.columnCandidates.dedup.includes(item.settings.dedupColumn)) els.dedupColumn.value = item.settings.dedupColumn;
    if (item.columnCandidates.email.includes(item.settings.emailColumn)) els.emailColumn.value = item.settings.emailColumn;
    if (item.columnCandidates.date.includes(item.settings.dateColumn)) els.dateColumn.value = item.settings.dateColumn;
    els.outputFormat.value = batchOutputFormat(els.batchOutputMode.value, item.file.name);
    els.outputFormat.disabled = true;
    setFilePresentation();
    updateUI();
    renderBatchPanel();
  }
  function selectBatchItem(id) {
    const item = state.batchItems.find((candidate) => candidate.id === id);
    if (!item || item.status === "queued" || item.status === "processing") return;
    hydrateFromBatchItem(item);
    announce(`${item.file.name} selected. ${STATUS_LABELS[item.status]}.`);
  }
  function removeBatchItem(id) {
    if (state.processing) return;
    const index = state.batchItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    const removed = state.batchItems[index];
    state.batchItems.splice(index, 1);
    if (state.batchItems.length === 1) {
      const remaining = state.batchItems[0];
      state.batchItems = [];
      state.activeBatchId = null;
      els.outputFormat.disabled = false;
      if (remaining) {
        if (remaining.headers.length === 0) {
          renderBatchPanel();
          handleFile(remaining.file);
          announce(`${removed?.file.name ?? "File"} removed. Reopening the remaining file.`);
          return;
        }
        state.headers = remaining.headers;
        state.rows = remaining.rows;
        state.rawRows = remaining.rawRows;
        state.filename = remaining.file.name;
        state.fileSize = remaining.file.size;
        state.sheetNames = remaining.sheetNames;
        state.generatedHeaderCount = remaining.generatedHeaderCount;
        state.output = remaining.output;
        state.manualEdits = remaining.manualEdits;
        state.dismissedEmailTypos = remaining.dismissedEmailTypos;
        els.outputFormat.value = remaining.sourceFormat;
        populateHeaderRows(remaining.rawRows, remaining.headerIndex);
        configureColumns();
        setFilePresentation();
        updateUI();
      }
    } else if (state.activeBatchId === id) {
      const fallback = state.batchItems[Math.min(index, state.batchItems.length - 1)];
      if (fallback) hydrateFromBatchItem(fallback);
    }
    renderBatchPanel();
    announce(`${removed?.file.name ?? "File"} removed from the batch.`);
  }
  function updateUI(options = {}) {
    syncDateSettings();
    const settings = getSettings();
    const result = cleanRows(state.headers, state.rows, settings, state.manualEdits, state.dismissedEmailTypos);
    state.output = result.output;
    const activeItem = activeBatchItem();
    if (activeItem) {
      activeItem.headers = state.headers;
      activeItem.rows = state.rows;
      activeItem.rawRows = state.rawRows;
      activeItem.generatedHeaderCount = state.generatedHeaderCount;
      activeItem.headerIndex = Number(els.headerRow.value);
      const candidates = detectColumnCandidates(state.headers, state.rows, settings.inputDateOrder);
      activeItem.confirmedColumns.dedup = candidates.dedup.length <= 1 ? true : activeItem.confirmedColumns.dedup && candidates.dedup.includes(settings.dedupColumn);
      activeItem.confirmedColumns.email = candidates.email.length <= 1 ? true : activeItem.confirmedColumns.email && candidates.email.includes(settings.emailColumn);
      activeItem.confirmedColumns.date = candidates.date.length <= 1 ? true : activeItem.confirmedColumns.date && candidates.date.includes(settings.dateColumn);
      activeItem.columnCandidates = candidates;
      if (options.announceChange) activeItem.approvedAsIs = false;
      applyBatchEvaluation(activeItem, result, settings, currentPresetSettings());
    }
    const tableOptions = {
      headers: state.headers,
      originalIssues: (row, sourceIndex) => issuesForOriginalRow(
        row,
        state.headers,
        settings,
        sourceIndex,
        state.dismissedEmailTypos
      ),
      onEdit: commitManualEdit,
      onEmailSuggestion: reviewEmailSuggestion
    };
    renderTable(els.beforeTable, { ...tableOptions, rows: state.rows, kind: "before" });
    renderTable(els.afterTable, { ...tableOptions, rows: result.output, kind: "after" });
    els.beforeCount.textContent = `${state.rows.length} rows`;
    els.afterCount.textContent = `${result.output.length} rows`;
    els.changedCount.textContent = String(result.summary.changedRows);
    els.emptyCount.textContent = String(result.summary.emptyRows);
    els.dateCount.textContent = String(result.summary.normalizedDates);
    els.duplicateCount.textContent = String(result.summary.duplicateRows);
    const valuesToReview = result.summary.invalidEmails + result.summary.possibleEmailTypos + result.summary.invalidDates;
    els.issueCount.textContent = String(valuesToReview);
    const extension = els.outputFormat.value.toUpperCase();
    if (state.batchItems.length > 1) {
      const readyCount = state.batchItems.filter((item) => item.status === "ready").length;
      els.downloadButtonLabel.textContent = "Download ready files";
      els.downloadMeta.textContent = `ZIP \xB7 ${readyCount} of ${state.batchItems.length} files ready`;
    } else {
      els.downloadButtonLabel.textContent = "Download cleaned file";
      els.downloadMeta.textContent = `${extension} \xB7 ${result.output.length} rows \xB7 ${state.isDemo ? "demo data" : "ready to download"}`;
    }
    renderInsights(result, settings);
    if (activeItem) renderBatchPanel();
    if (options.announceChange) {
      announce(`${result.output.length} cleaned rows ready. ${valuesToReview} values need review.`);
    }
  }
  function setFilePresentation() {
    els.fileName.textContent = state.filename;
    els.fileMeta.textContent = `${fileSizeLabel(state.fileSize)} \xB7 ${state.rows.length} rows`;
    els.changeFile.textContent = "Choose files";
  }
  function setProcessing(processing, message = "Processing file\u2026") {
    state.processing = processing;
    els.processingStatus.hidden = !processing;
    els.processingStatusCopy.textContent = message;
    els.fileDrop.disabled = processing;
    els.fileDrop.setAttribute("aria-busy", String(processing));
    els.downloadButton.disabled = processing;
    els.outputFormat.disabled = processing || state.batchItems.length > 1;
    els.batchOutputMode.disabled = processing;
    els.presetSelect.disabled = processing;
    els.presetSave.disabled = processing;
    els.presetDelete.disabled = processing || els.presetSelect.value === "last-used";
    els.presetReset.disabled = processing;
    [
      els.removeEmpty,
      els.trimWhitespace,
      els.deduplicate,
      els.validateEmail,
      els.normalizeDates,
      els.dedupColumn,
      els.emailColumn,
      els.dateColumn
    ].forEach((control) => {
      control.disabled = processing;
    });
    if (!processing) configureColumns();
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
    els.headerRow.replaceChildren(...candidates.map(({ index, preview }) => new Option(`Row ${index + 1} \u2014 ${preview}`, String(index))));
    els.headerRow.value = String(selectedIndex);
    els.headerRow.disabled = candidates.length < 2 || state.processing;
  }
  function adoptSheet(rawRows, headerIndex) {
    const prepared = prepareSheet(rawRows, headerIndex);
    state.headers = prepared.headers;
    state.rows = prepared.rows;
    state.generatedHeaderCount = prepared.generatedHeaderCount;
    state.manualEdits.clear();
    state.dismissedEmailTypos.clear();
    applyPresetToControls(currentPresetSettings());
    setFilePresentation();
    updateUI({ announceChange: true });
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
    setProcessing(true, "Reading and checking your file\u2026");
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await processor.load(fileType, buffer);
      state.filename = file.name;
      state.fileSize = file.size;
      state.isDemo = false;
      state.batchItems = [];
      state.activeBatchId = null;
      state.sheetNames = [...parsed.sheetNames];
      els.outputFormat.disabled = false;
      els.outputFormat.value = fileType;
      if (fileType === "csv") {
        els.worksheet.replaceChildren(new Option("Not needed for CSV", "csv"));
        els.worksheet.disabled = true;
      } else {
        els.worksheet.replaceChildren(...parsed.sheetNames.map((name) => new Option(name, name)));
        els.worksheet.value = parsed.activeSheet ?? parsed.sheetNames[0] ?? "";
        els.worksheet.disabled = parsed.sheetNames.length < 2;
      }
      clearFileError();
      loadActiveSheet(parsed.rows);
    } finally {
      setProcessing(false);
    }
  }
  function createBatchItem(file, index) {
    const sourceFormat = outputFormatForFile(file.name);
    const preset = currentPresetSettings();
    return {
      id: `batch-${Date.now()}-${index}`,
      file,
      sourceFormat,
      status: "queued",
      statusMessage: fileSizeLabel(file.size),
      headers: [],
      rows: [],
      rawRows: [],
      sheetNames: [],
      activeSheet: null,
      headerIndex: 0,
      generatedHeaderCount: 0,
      columnCandidates: { date: [], email: [], dedup: [] },
      confirmedColumns: { dedup: true, email: true, date: true },
      settings: cleaningSettingsFor(preset, { date: [], email: [], dedup: [] }),
      output: [],
      summary: null,
      reviewReasons: [],
      approvedAsIs: false,
      sheetConfirmed: true,
      safeExport: false,
      manualEdits: /* @__PURE__ */ new Map(),
      dismissedEmailTypos: /* @__PURE__ */ new Map()
    };
  }
  async function processBatchItem(item) {
    item.status = "processing";
    item.statusMessage = "Reading and checking file\u2026";
    renderBatchPanel();
    try {
      const parsed = await processor.load(item.sourceFormat, await item.file.arrayBuffer());
      let selectedRows = parsed.rows;
      let activeSheet = parsed.activeSheet;
      if (item.sourceFormat === "xlsx" && parsed.sheetNames.length > 1 && !hasMeaningfulCells(selectedRows)) {
        for (const sheetName of parsed.sheetNames) {
          const rows = sheetName === parsed.activeSheet ? parsed.rows : await processor.selectSheet(sheetName);
          if (!hasMeaningfulCells(rows)) continue;
          selectedRows = rows;
          activeSheet = sheetName;
          break;
        }
      }
      const headerIndex = findHeaderRow(selectedRows);
      const prepared = prepareSheet(selectedRows, headerIndex);
      item.rawRows = selectedRows;
      item.headerIndex = headerIndex;
      item.headers = prepared.headers;
      item.rows = prepared.rows;
      item.generatedHeaderCount = prepared.generatedHeaderCount;
      item.sheetNames = [...parsed.sheetNames];
      item.activeSheet = activeSheet;
      item.sheetConfirmed = parsed.sheetNames.length <= 1;
      item.columnCandidates = detectColumnCandidates(item.headers, item.rows, currentPresetSettings().inputDateOrder);
      item.confirmedColumns = {
        dedup: item.columnCandidates.dedup.length <= 1,
        email: item.columnCandidates.email.length <= 1,
        date: item.columnCandidates.date.length <= 1
      };
      item.status = "ready";
      evaluateBatchItem(item);
    } catch (error) {
      item.status = "failed";
      item.statusMessage = normalizeError(error);
      item.reviewReasons = [item.statusMessage];
    }
    renderBatchPanel();
  }
  function hasMeaningfulCells(rows) {
    return rows.some((row) => row.some((cell) => cellToString(cell).trim() !== ""));
  }
  function retainedBatchCells(excludedId = null) {
    return state.batchItems.reduce((total, item) => item.id === excludedId || item.status === "failed" || item.status === "cancelled" ? total : total + item.rows.length * item.headers.length, 0);
  }
  function enforceBatchCellLimit(item, retainedCells) {
    const itemCells = item.rows.length * item.headers.length;
    if (retainedCells + itemCells <= MAX_BATCH_CELLS) return true;
    item.status = "failed";
    item.statusMessage = "The batch would hold more than 2,000,000 cells in memory. Remove another file or process this file separately.";
    item.reviewReasons = [item.statusMessage];
    item.headers = [];
    item.rows = [];
    item.rawRows = [];
    item.output = [];
    item.summary = null;
    return false;
  }
  async function processBatchFiles(files) {
    const perFileLimit = processor.supportsBackgroundProcessing ? HOSTED_FILE_LIMIT_BYTES : LOCAL_FILE_LIMIT_BYTES;
    validateBatchSelection(files, perFileLimit);
    const items = files.map(createBatchItem);
    state.batchItems = items;
    state.activeBatchId = null;
    state.stopBatch = false;
    clearFileError();
    setProcessing(true, `Processing 1 of ${items.length} files\u2026`);
    renderBatchPanel();
    let retainedCells = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      if (state.stopBatch) {
        item.status = "cancelled";
        item.statusMessage = "Cancelled before processing";
        continue;
      }
      setProcessing(true, `Processing ${index + 1} of ${items.length} files\u2026`);
      await processBatchItem(item);
      if (item.status !== "failed") {
        const itemCells = item.rows.length * item.headers.length;
        if (enforceBatchCellLimit(item, retainedCells)) retainedCells += itemCells;
      }
    }
    setProcessing(false);
    const firstAvailable = items.find((item) => item.status === "ready" || item.status === "needs-review" || item.status === "failed");
    if (firstAvailable) hydrateFromBatchItem(firstAvailable);
    renderBatchPanel();
    const ready = items.filter((item) => item.status === "ready").length;
    const review = items.filter((item) => item.status === "needs-review").length;
    announce(`Batch complete. ${ready} files ready. ${review} need review.`);
  }
  async function retryBatchItem(item) {
    if (state.processing) return;
    item.approvedAsIs = false;
    item.safeExport = false;
    setProcessing(true, `Retrying ${item.file.name}\u2026`);
    await processBatchItem(item);
    if (item.status !== "failed") enforceBatchCellLimit(item, retainedBatchCells(item.id));
    setProcessing(false);
    hydrateFromBatchItem(item);
  }
  async function onWorksheetChange() {
    const sheetName = els.worksheet.value;
    if (!sheetName || sheetName === "csv") return;
    setProcessing(true, `Loading ${sheetName}\u2026`);
    try {
      const activeItem = activeBatchItem();
      if (activeItem) {
        await processor.load(activeItem.sourceFormat, await activeItem.file.arrayBuffer());
      }
      const rows = await processor.selectSheet(sheetName);
      clearFileError();
      loadActiveSheet(rows);
      if (activeItem) {
        activeItem.activeSheet = sheetName;
        activeItem.sheetConfirmed = true;
        activeItem.approvedAsIs = false;
        activeItem.rawRows = rows;
        activeItem.headerIndex = findHeaderRow(rows);
        updateUI({ announceChange: true });
      }
    } catch (error) {
      showFileError(normalizeError(error));
    } finally {
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
    const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function downloadCleaned(options = {}) {
    const rawRows = [state.headers, ...state.output.map((entry) => entry.values)];
    const rows = options.safe ? safeRows(rawRows) : rawRows.map((row) => row.map(cellToString));
    const format = els.outputFormat.value;
    const baseName = state.filename.replace(/\.(csv|xlsx)$/i, "") || "cleaned-data";
    const originalLabel = els.downloadButtonLabel.textContent ?? "Download cleaned file";
    els.downloadButton.disabled = true;
    els.downloadButton.setAttribute("aria-busy", "true");
    els.downloadButtonLabel.textContent = "Preparing file\u2026";
    try {
      const exported = await processor.exportRows(format, rows, Boolean(options.safe && format === "csv"));
      triggerDownload(exported.buffer, exported.mime, `${baseName}_cleaned.${exported.extension}`);
      els.downloadButton.classList.remove("is-ready");
      void els.downloadButton.offsetWidth;
      els.downloadButton.classList.add("is-ready");
      announce(options.safe ? "Your safe cleaned file download has started." : "Your cleaned file download has started.");
    } catch (error) {
      showFileError(`${normalizeError(error)} Try the download again.`);
    } finally {
      els.downloadButton.disabled = false;
      els.downloadButton.removeAttribute("aria-busy");
      els.downloadButtonLabel.textContent = originalLabel;
    }
  }
  function cleanedArchiveFilename(item, extension) {
    const base = item.file.name.replace(/\.(csv|xlsx)$/i, "").replace(/[\\/:*?"<>|]/g, "-").trim() || "cleaned-data";
    return `${base}_cleaned.${extension}`;
  }
  function batchReportEntries(includedIds) {
    return state.batchItems.map((item) => ({
      filename: item.file.name,
      status: item.status,
      sourceRows: item.rows.length,
      outputRows: item.output.length,
      summary: item.summary,
      reviewReasons: item.reviewReasons,
      approvedAsIs: item.approvedAsIs,
      includedInZip: includedIds.has(item.id)
    }));
  }
  async function downloadBatch() {
    const readyItems = state.batchItems.filter((item) => item.status === "ready");
    if (!readyItems.length) {
      showFileError("No files are ready yet. Review or retry the files in the batch first.");
      return;
    }
    const originalLabel = els.downloadButtonLabel.textContent ?? "Download ready files";
    els.downloadButton.disabled = true;
    els.downloadButton.setAttribute("aria-busy", "true");
    els.downloadButtonLabel.textContent = "Preparing ZIP\u2026";
    try {
      const usedNames = /* @__PURE__ */ new Set();
      const archiveFiles = [];
      for (let index = 0; index < readyItems.length; index += 1) {
        const item = readyItems[index];
        if (!item) continue;
        els.downloadButtonLabel.textContent = `Exporting ${index + 1} of ${readyItems.length}\u2026`;
        const format = batchOutputFormat(els.batchOutputMode.value, item.file.name);
        const rawRows = [item.headers, ...item.output.map((entry) => entry.values)];
        const rows = item.safeExport ? safeRows(rawRows) : rawRows.map((row) => row.map(cellToString));
        const exported = await processor.exportRows(format, rows, item.safeExport && format === "csv");
        archiveFiles.push({
          name: uniqueArchiveName(cleanedArchiveFilename(item, exported.extension), usedNames),
          data: exported.buffer
        });
      }
      const includedIds = new Set(readyItems.map((item) => item.id));
      archiveFiles.push({ name: "cleanup_report.csv", data: `\uFEFF${cleanupReportCsv(batchReportEntries(includedIds))}` });
      els.downloadButtonLabel.textContent = "Creating ZIP\u2026";
      const archive = await createZip(archiveFiles);
      triggerDownload(archive, "application/zip", "cleaned_files.zip");
      els.downloadButton.classList.remove("is-ready");
      void els.downloadButton.offsetWidth;
      els.downloadButton.classList.add("is-ready");
      announce(`${readyItems.length} cleaned files and the report were added to the ZIP download.`);
    } catch (error) {
      showFileError(`${normalizeError(error)} No ZIP was downloaded.`);
    } finally {
      els.downloadButton.disabled = false;
      els.downloadButton.removeAttribute("aria-busy");
      els.downloadButtonLabel.textContent = originalLabel;
    }
  }
  function requestDownload() {
    if (state.batchItems.length > 1) {
      void downloadBatch();
      return;
    }
    const rows = [state.headers, ...state.output.map((entry) => entry.values)];
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
    void loadFile(file).catch((error) => {
      showFileError(normalizeError(error));
      els.fileInput.value = "";
      setProcessing(false);
    });
  }
  function handleFiles(files) {
    if (!files.length) return;
    const unsupported = files.find((file) => !/\.(csv|xlsx)$/i.test(file.name));
    if (unsupported) {
      showFileError(`${unsupported.name} is not a supported CSV or XLSX file.`);
      return;
    }
    if (files.length === 1) {
      handleFile(files[0]);
      return;
    }
    void processBatchFiles(files).catch((error) => {
      showFileError(normalizeError(error));
      setProcessing(false);
      renderBatchPanel();
    });
  }
  function reapplyPresetToBatch() {
    const preset = currentPresetSettings();
    state.batchItems.forEach((item) => {
      if (item.status === "failed" || item.status === "cancelled" || item.status === "processing" || item.status === "queued") return;
      item.approvedAsIs = false;
      const candidates = detectColumnCandidates(item.headers, item.rows, preset.inputDateOrder);
      item.confirmedColumns = {
        dedup: candidates.dedup.length <= 1 || item.confirmedColumns.dedup && candidates.dedup.includes(item.settings.dedupColumn),
        email: candidates.email.length <= 1 || item.confirmedColumns.email && candidates.email.includes(item.settings.emailColumn),
        date: candidates.date.length <= 1 || item.confirmedColumns.date && candidates.date.includes(item.settings.dateColumn)
      };
      item.columnCandidates = candidates;
      evaluateBatchItem(item, preset);
    });
  }
  function handlePreferenceChange() {
    activePresetSettings = currentPresetSettings();
    configureColumns();
    rememberLastUsed();
    reapplyPresetToBatch();
    const active = activeBatchItem();
    if (active) {
      els.outputFormat.value = batchOutputFormat(activePresetSettings.batchOutputMode, active.file.name);
    }
    updateUI({ announceChange: true });
    renderBatchPanel();
  }
  function handleBatchOutputChange() {
    activePresetSettings = currentPresetSettings();
    rememberLastUsed();
    const active = activeBatchItem();
    if (active) {
      els.outputFormat.value = batchOutputFormat(activePresetSettings.batchOutputMode, active.file.name);
    }
    updateUI();
    renderBatchPanel();
    announce("Batch output format updated. Existing review decisions were kept.");
  }
  function loadSelectedPreset() {
    const selected = els.presetSelect.value;
    const settings = selected === "last-used" ? presetStore.lastUsed : presetStore.named.find((preset) => preset.id === selected)?.settings;
    if (!settings) return;
    applyPresetToControls(settings);
    rememberLastUsed();
    reapplyPresetToBatch();
    updateUI({ announceChange: true });
    renderPresetOptions(selected);
    renderBatchPanel();
    announce(`${selected === "last-used" ? "Last used settings" : "Preset"} applied.`);
  }
  function showPresetForm() {
    els.presetForm.hidden = false;
    els.presetName.value = "";
    els.presetName.focus();
  }
  function hidePresetForm() {
    els.presetForm.hidden = true;
    els.presetName.value = "";
    els.presetSave.focus();
  }
  function saveNamedPreset() {
    try {
      presetStore = upsertNamedPreset(presetStore, els.presetName.value, currentPresetSettings());
      const saved = presetStore.named.find((preset) => preset.name.toLowerCase() === els.presetName.value.trim().toLowerCase());
      persistPresetStore();
      renderPresetOptions(saved?.id ?? "last-used");
      hidePresetForm();
      announce(`${saved?.name ?? "Preset"} saved.`);
    } catch (error) {
      showFileError(normalizeError(error));
      els.presetName.focus();
    }
  }
  function deleteSelectedPreset() {
    const id = els.presetSelect.value;
    const preset = presetStore.named.find((entry) => entry.id === id);
    if (!preset) return;
    presetStore = deleteNamedPreset(presetStore, id);
    persistPresetStore();
    renderPresetOptions("last-used");
    announce(`${preset.name} deleted.`);
  }
  function resetSettings() {
    applyPresetToControls(DEFAULT_PRESET);
    rememberLastUsed();
    reapplyPresetToBatch();
    updateUI({ announceChange: true });
    renderPresetOptions("last-used");
    renderBatchPanel();
    announce("Default cleaning settings restored.");
  }
  function bindEvents() {
    els.themeToggle.addEventListener("click", themeController.toggle);
    els.fileDrop.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", () => {
      handleFiles(Array.from(els.fileInput.files ?? []));
      els.fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!state.processing) els.fileDrop.classList.add("is-dragover");
    }));
    ["dragleave", "drop"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.fileDrop.classList.remove("is-dragover");
    }));
    els.fileDrop.addEventListener("drop", (event) => {
      if (!state.processing) handleFiles(Array.from(event.dataTransfer?.files ?? []));
    });
    els.worksheet.addEventListener("change", () => {
      void onWorksheetChange();
    });
    els.headerRow.addEventListener("change", onHeaderRowChange);
    els.outputFormat.addEventListener("change", () => {
      if (state.batchItems.length < 2) updateUI();
    });
    [
      els.removeEmpty,
      els.trimWhitespace,
      els.deduplicate,
      els.validateEmail,
      els.normalizeDates,
      els.dateFormat
    ].forEach((control) => control.addEventListener("change", handlePreferenceChange));
    els.inputDateOrder.addEventListener("change", handlePreferenceChange);
    els.batchOutputMode.addEventListener("change", handleBatchOutputChange);
    [
      [els.dedupColumn, "dedup"],
      [els.emailColumn, "email"],
      [els.dateColumn, "date"]
    ].forEach(([control, type]) => control.addEventListener("change", () => {
      const active = activeBatchItem();
      if (active) {
        active.approvedAsIs = false;
        active.confirmedColumns[type] = true;
      }
      updateUI({ announceChange: true });
    }));
    const columnPickers = [
      [els.dedupPicker, els.dedupChange],
      [els.emailPicker, els.emailChange],
      [els.datePicker, els.dateChange]
    ];
    columnPickers.forEach(([picker, button]) => button.addEventListener("click", () => toggleColumnPicker(picker, button)));
    els.presetSelect.addEventListener("change", loadSelectedPreset);
    els.presetSave.addEventListener("click", showPresetForm);
    els.presetDelete.addEventListener("click", deleteSelectedPreset);
    els.presetReset.addEventListener("click", resetSettings);
    els.presetCancel.addEventListener("click", hidePresetForm);
    els.presetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveNamedPreset();
    });
    els.batchCancel.addEventListener("click", () => {
      state.stopBatch = true;
      state.batchItems.forEach((item) => {
        if (item.status === "queued") {
          item.status = "cancelled";
          item.statusMessage = "Cancelled before processing";
        }
      });
      renderBatchPanel();
      announce("Remaining queued files will not be processed.");
    });
    els.batchConfirmSheet.addEventListener("click", () => {
      const item = activeBatchItem();
      if (!item) return;
      item.sheetConfirmed = true;
      item.approvedAsIs = false;
      updateUI({ announceChange: true });
    });
    els.batchSafeExport.addEventListener("click", () => {
      const item = activeBatchItem();
      if (!item) return;
      item.safeExport = true;
      item.approvedAsIs = false;
      updateUI({ announceChange: true });
      announce(`${item.file.name} will store formula-like values as plain text.`);
    });
    els.batchApprove.addEventListener("click", () => {
      const item = activeBatchItem();
      if (!item) return;
      item.approvedAsIs = true;
      updateUI();
      renderBatchPanel();
      announce(`${item.file.name} approved with its remaining values unchanged.`);
    });
    els.batchRetry.addEventListener("click", () => {
      const item = activeBatchItem();
      if (item) void retryBatchItem(item);
    });
    els.downloadButton.addEventListener("click", requestDownload);
    els.formulaDialog.addEventListener("close", () => {
      if (els.formulaDialog.returnValue === "safe") void downloadCleaned({ safe: true });
      if (els.formulaDialog.returnValue === "original") void downloadCleaned();
    });
    els.emailTypoDialog.addEventListener("close", finishEmailSuggestionReview);
    window.addEventListener("beforeunload", () => {
      themeController.dispose();
      processor.dispose();
    }, { once: true });
  }
  function initialize() {
    els.fileLimit.textContent = processor.supportsBackgroundProcessing ? `Files up to 50 MB are processed in the background. Batch: up to ${MAX_BATCH_FILES} files and 100 MB total.` : "Direct-open mode supports files up to 10 MB. Use the GitHub Pages version for files up to 50 MB.";
    try {
      presetStore = readPresetStore(window.localStorage);
    } catch {
      presetStore = emptyPresetStore();
    }
    activePresetSettings = { ...presetStore.lastUsed };
    populateHeaderRows(state.rawRows, 0);
    themeController.initialize();
    applyPresetToControls(activePresetSettings);
    renderPresetOptions();
    setFilePresentation();
    bindEvents();
    updateUI();
    renderBatchPanel();
  }
  initialize();
})();
