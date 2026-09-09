(() => {
  "use strict";

  const SAMPLE_HEADERS = ["Name", "Email", "Sign Up Date", "Amount", "Country"];
  const SAMPLE_ROWS = [
    ["John Doe ", "john.doe@gmail.com", "1/4/2024", "99.00", "USA"],
    ["Jane Smith", "jane.smith@yahoo.com", "04-01-24", "149", "United Kingdom"],
    ["", "invalid-email", "2024/01/05", "", "Canada"],
    ["Mike Brown", "mike.brown@gmail.com", "Jan 6, 2024", "200.00", "USA"],
    ["Sara Lee", "sara.lee@hotmail.co", "1/7/24", "99", "USA"],
    ["Tom Wilson", "tom.wilson@gmail.com", "2024-01-07", "99.0", ""],
    ["Emily Davis", "emily.davis@outlook.com", "13/01/2024", "250", "Australia"],
    ["John Doe ", " john.doe@gmail.com ", "2024/01/04", "99.00", "USA"],
    ["Alex Kim", "alex.kim@gmail.com", "01-08-2024", "175", "USA"],
    ["Chris Park", "chris.park@gmail.com", "Jan 9 2024", "300", "New Zealand"]
  ];

  const els = {
    fileInput: document.querySelector("#fileInput"),
    fileDrop: document.querySelector("#fileDrop"),
    fileName: document.querySelector("#fileName"),
    fileMeta: document.querySelector("#fileMeta"),
    fileStatus: document.querySelector("#fileStatus"),
    outputFormat: document.querySelector("#outputFormat"),
    worksheet: document.querySelector("#worksheetSelect"),
    dateFormat: document.querySelector("#dateFormat"),
    removeEmpty: document.querySelector("#removeEmpty"),
    trimWhitespace: document.querySelector("#trimWhitespace"),
    deduplicate: document.querySelector("#deduplicate"),
    dedupColumn: document.querySelector("#dedupColumn"),
    validateEmail: document.querySelector("#validateEmail"),
    emailColumn: document.querySelector("#emailColumn"),
    normalizeDates: document.querySelector("#normalizeDates"),
    dateColumn: document.querySelector("#dateColumn"),
    beforeTable: document.querySelector("#beforeTable"),
    afterTable: document.querySelector("#afterTable"),
    beforeCount: document.querySelector("#beforeCount"),
    afterCount: document.querySelector("#afterCount"),
    changedCount: document.querySelector("#changedCount"),
    invalidEmailCount: document.querySelector("#invalidEmailCount"),
    dateCount: document.querySelector("#dateCount"),
    duplicateCount: document.querySelector("#duplicateCount"),
    downloadButton: document.querySelector("#downloadButton"),
    downloadMeta: document.querySelector("#downloadMeta"),
    announcer: document.querySelector("#announcer")
  };

  const state = {
    headers: [...SAMPLE_HEADERS],
    rows: SAMPLE_ROWS.map((row) => [...row]),
    filename: "customers_dirty.csv",
    fileSize: null,
    sheets: {},
    isDemo: true,
    output: [],
    summary: null,
    manualEdits: new Map()
  };

  function announce(message) {
    els.announcer.textContent = "";
    window.setTimeout(() => { els.announcer.textContent = message; }, 25);
  }

  function cleanValue(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function isBlankRow(row) {
    return row.every((cell) => cleanValue(cell).trim() === "");
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(cleanValue(value).trim());
  }

  function isValidDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function formatDate({ year, month, day }, format) {
    const twoDigitYear = String(year % 100).padStart(2, "0");
    const twoDigitMonth = String(month).padStart(2, "0");
    const twoDigitDay = String(day).padStart(2, "0");
    if (format === "MM-DD-YY") return `${twoDigitMonth}-${twoDigitDay}-${twoDigitYear}`;
    if (format === "YY-MM-DD") return `${twoDigitYear}-${twoDigitMonth}-${twoDigitDay}`;
    return `${twoDigitDay}-${twoDigitMonth}-${twoDigitYear}`;
  }

  function parseDate(value, format) {
    const source = cleanValue(value).trim();
    if (!source) return { status: "empty" };
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(source)) {
      const [year, month, day] = source.split(/[/-]/).map(Number);
      return isValidDate(year, month, day) ? { status: "valid", value: formatDate({ year, month, day }, format) } : { status: "invalid" };
    }
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(source)) {
      const [first, second, yearRaw] = source.split(/[/-]/).map(Number);
      const [year, month, day] = format === "YY-MM-DD"
        ? [first < 100 ? 2000 + first : first, second, yearRaw]
        : [yearRaw < 100 ? 2000 + yearRaw : yearRaw, ...(format === "MM-DD-YY" ? [first, second] : [second, first])];
      return isValidDate(year, month, day) ? { status: "valid", value: formatDate({ year, month, day }, format) } : { status: "invalid" };
    }
    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) return { status: "invalid" };
    return { status: "valid", value: formatDate({ year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() }, format) };
  }

  function fileSizeLabel(bytes) {
    if (!bytes) return "Demo data · 10 rows";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function optionList(select, preferred, allowNone = false) {
    const previous = select.value;
    select.replaceChildren();
    if (allowNone) {
      const none = new Option("No column", "");
      select.add(none);
    }
    state.headers.forEach((header) => select.add(new Option(header, header)));
    const candidate = state.headers.includes(previous) ? previous : preferred;
    select.value = candidate || "";
  }

  function configureColumns() {
    const emailHeader = state.headers.find((header) => /e-?mail/i.test(header)) || state.headers[0] || "";
    const dateHeader = state.headers.find((header) => /date/i.test(header)) || state.headers[0] || "";
    optionList(els.dedupColumn, emailHeader, true);
    optionList(els.emailColumn, emailHeader, true);
    optionList(els.dateColumn, dateHeader, true);
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
      dateFormat: els.dateFormat.value
    };
  }

  function cleanRows() {
    const settings = getSettings();
    const dedupIndex = state.headers.indexOf(settings.dedupColumn);
    const emailIndex = state.headers.indexOf(settings.emailColumn);
    const dateIndex = state.headers.indexOf(settings.dateColumn);
    const seen = new Set();
    const summary = { changedRows: 0, emptyRows: 0, duplicateRows: 0, invalidEmails: 0, normalizedDates: 0, ambiguousDates: 0 };
    const output = [];

    state.rows.forEach((original, sourceIndex) => {
      if (settings.removeEmpty && isBlankRow(original)) {
        summary.emptyRows += 1;
        return;
      }

      const row = original.map(cleanValue);
      const issues = {};
      let changed = false;

      if (settings.trimWhitespace) {
        row.forEach((value, index) => {
          const trimmed = value.trim();
          if (trimmed !== value) {
            row[index] = trimmed;
            changed = true;
          }
        });
      }

      row.forEach((value, index) => {
        const manualValue = state.manualEdits.get(`${sourceIndex}:${index}`);
        if (manualValue !== undefined && manualValue !== value) {
          row[index] = manualValue;
          changed = true;
        }
      });

      if (settings.deduplicate && dedupIndex >= 0) {
        const key = cleanValue(row[dedupIndex]).trim().toLocaleLowerCase();
        if (key) {
          if (seen.has(key)) {
            summary.duplicateRows += 1;
            return;
          }
          seen.add(key);
        }
      }

      if (settings.validateEmail && emailIndex >= 0 && cleanValue(row[emailIndex]).trim() && !isEmail(row[emailIndex])) {
        issues[emailIndex] = "Invalid email";
        summary.invalidEmails += 1;
      }

      if (settings.normalizeDates && dateIndex >= 0 && cleanValue(row[dateIndex]).trim()) {
        const result = parseDate(row[dateIndex], settings.dateFormat);
        if (result.status === "valid" && result.value !== row[dateIndex]) {
          row[dateIndex] = result.value;
          summary.normalizedDates += 1;
          changed = true;
        } else if (result.status === "invalid") {
          issues[dateIndex] = "Invalid date";
          summary.ambiguousDates += 1;
        }
      }

      if (changed) summary.changedRows += 1;
      output.push({ values: row, issues, changed, sourceIndex });
    });

    return { output, summary };
  }

  function originalIssues(row) {
    const settings = getSettings();
    const issues = {};
    const emailIndex = state.headers.indexOf(settings.emailColumn);
    const dateIndex = state.headers.indexOf(settings.dateColumn);
    if (settings.validateEmail && emailIndex >= 0 && cleanValue(row[emailIndex]).trim() && !isEmail(row[emailIndex])) issues[emailIndex] = "Invalid email";
    if (settings.normalizeDates && dateIndex >= 0 && cleanValue(row[dateIndex]).trim()) {
      const result = parseDate(row[dateIndex], settings.dateFormat);
      if (result.status === "invalid") issues[dateIndex] = "Invalid date";
    }
    return issues;
  }

  function commitManualEdit(editor) {
    const sourceIndex = Number(editor.dataset.sourceIndex);
    const columnIndex = Number(editor.dataset.columnIndex);
    const nextValue = cleanValue(editor.textContent).replace(/[\r\n]+/g, " ");
    const savedValue = editor.dataset.savedValue || "";
    if (nextValue === savedValue) return;
    state.manualEdits.set(`${sourceIndex}:${columnIndex}`, nextValue);
    updateUI({ announceChange: true });
  }

  function makeEditableCell(value, entry, columnIndex) {
    const editor = document.createElement("span");
    editor.className = "cell-editor";
    editor.contentEditable = "true";
    editor.spellcheck = false;
  editor.setAttribute("role", "textbox");
    editor.tabIndex = 0;
    editor.dataset.sourceIndex = String(entry.sourceIndex);
    editor.dataset.columnIndex = String(columnIndex);
    editor.dataset.savedValue = cleanValue(value);
    editor.setAttribute("aria-label", `Edit row ${entry.sourceIndex + 1}, ${state.headers[columnIndex]}`);
    editor.textContent = cleanValue(value);
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        editor.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        editor.textContent = editor.dataset.savedValue || "";
        editor.blur();
      }
    });
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    });
    editor.addEventListener("blur", () => commitManualEdit(editor));
    return editor;
  }

  function createTable(table, rows, kind) {
    table.replaceChildren();
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const numberHead = document.createElement("th");
    numberHead.scope = "col";
    numberHead.textContent = "#";
    headRow.append(numberHead);
    state.headers.forEach((header) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = header;
      headRow.append(th);
    });
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    rows.slice(0, 10).forEach((entry, index) => {
      const row = Array.isArray(entry) ? { values: entry, issues: originalIssues(entry), changed: false } : entry;
      const tr = document.createElement("tr");
      const number = document.createElement("td");
      number.textContent = String(index + 1);
      tr.append(number);
      row.values.forEach((value, columnIndex) => {
        const td = document.createElement("td");
        if (kind === "after") td.append(makeEditableCell(value, row, columnIndex));
        else td.textContent = cleanValue(value) || "—";
        if (row.issues[columnIndex]) {
          td.classList.add("warning");
          const issue = document.createElement("span");
          issue.className = "issue";
          issue.textContent = row.issues[columnIndex];
          td.append(issue);
        } else if (kind === "after" && row.changed) {
          td.classList.add("changed");
        }
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
  }

  function updateUI({ announceChange = false } = {}) {
    const result = cleanRows();
    state.output = result.output;
    state.summary = result.summary;
    createTable(els.beforeTable, state.rows, "before");
    createTable(els.afterTable, result.output, "after");

    els.beforeCount.textContent = `${Math.min(10, state.rows.length)} of ${state.rows.length} rows`;
    els.afterCount.textContent = `${Math.min(10, result.output.length)} of ${result.output.length} rows (preview)`;
    els.changedCount.textContent = result.summary.changedRows;
    els.invalidEmailCount.textContent = result.summary.invalidEmails;
    els.dateCount.textContent = result.summary.normalizedDates;
    els.duplicateCount.textContent = result.summary.duplicateRows + result.summary.emptyRows;
    const extension = els.outputFormat.value.toUpperCase();
    els.downloadMeta.textContent = `${extension} · ${result.output.length} rows · ${state.isDemo ? "demo preview" : "ready to download"}`;
    if (announceChange) announce(`${result.output.length} cleaned rows ready. ${result.summary.invalidEmails + result.summary.ambiguousDates} values need review.`);
  }

  function setFilePresentation() {
    els.fileName.textContent = state.filename;
    els.fileMeta.textContent = `${state.isDemo ? "Demo data" : fileSizeLabel(state.fileSize)} · ${state.rows.length} rows`;
    els.fileStatus.textContent = state.isDemo ? "No file uploaded" : "File loaded";
    els.fileStatus.classList.toggle("has-file", !state.isDemo);
  }

  function csvToRows(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (inQuotes && text[index + 1] === '"') { cell += '"'; index += 1; }
        else inQuotes = !inQuotes;
      } else if (character === "," && !inQuotes) { row.push(cell); cell = ""; }
      else if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell);
        rows.push(row);
        row = []; cell = "";
      } else cell += character;
    }
    row.push(cell);
    if (row.some((value) => value !== "") || cell !== "") rows.push(row);
    return rows;
  }

  function adoptSheet(rawRows) {
    const headerIndex = rawRows.findIndex((row) => row.some((cell) => cleanValue(cell) !== ""));
    if (headerIndex < 0) throw new Error("This worksheet is empty.");
    const headerRow = rawRows[headerIndex].map((value, index) => cleanValue(value).trim() || `Column ${index + 1}`);
    const width = headerRow.length;
    state.headers = headerRow;
    state.rows = rawRows.slice(headerIndex + 1).map((row) => Array.from({ length: width }, (_, index) => cleanValue(row[index])));
    state.manualEdits.clear();
    configureColumns();
    setFilePresentation();
    updateUI({ announceChange: true });
  }

  async function loadFile(file) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
      throw new Error("Choose a .csv or .xlsx file.");
    }
    state.filename = file.name;
    state.fileSize = file.size;
    state.isDemo = false;
    state.sheets = {};
    if (lowerName.endsWith(".csv")) {
      els.worksheet.replaceChildren(new Option("Not needed for CSV", "csv"));
      els.worksheet.disabled = true;
      adoptSheet(csvToRows(await file.text()));
      return;
    }
    if (!window.XLSX) throw new Error("Excel support is still loading. Please try the same file again in a moment.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    workbook.SheetNames.forEach((name) => { state.sheets[name] = window.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" }); });
    els.worksheet.replaceChildren(...workbook.SheetNames.map((name) => new Option(name, name)));
    els.worksheet.disabled = false;
    adoptSheet(state.sheets[workbook.SheetNames[0]]);
  }

  function onWorksheetChange() {
    if (state.sheets[els.worksheet.value]) adoptSheet(state.sheets[els.worksheet.value]);
  }

  function csvEscape(value) {
    const source = cleanValue(value);
    return /[",\n\r]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCleaned() {
    const rows = [state.headers, ...state.output.map((entry) => entry.values)];
    const baseName = state.filename.replace(/\.(csv|xlsx)$/i, "") || "cleaned-data";
    if (els.outputFormat.value === "xlsx") {
      if (!window.XLSX) {
        announce("Excel export is still loading. Please try again in a moment.");
        return;
      }
      const workbook = window.XLSX.utils.book_new();
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Cleaned data");
      const data = window.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      triggerDownload(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${baseName}_cleaned.xlsx`);
    } else {
      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
      triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${baseName}_cleaned.csv`);
    }
    els.downloadButton.classList.remove("is-ready");
    void els.downloadButton.offsetWidth;
    els.downloadButton.classList.add("is-ready");
    announce("Your cleaned file download has started.");
  }

  function handleFile(file) {
    if (!file) return;
    loadFile(file).catch((error) => {
      announce(error.message);
      els.fileMeta.textContent = error.message;
    });
  }

  function bindEvents() {
    els.fileDrop.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
    ["dragenter", "dragover"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => { event.preventDefault(); els.fileDrop.classList.add("is-dragover"); }));
    ["dragleave", "drop"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => { event.preventDefault(); els.fileDrop.classList.remove("is-dragover"); }));
    els.fileDrop.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
    els.worksheet.addEventListener("change", onWorksheetChange);
    els.outputFormat.addEventListener("change", () => updateUI());
    [els.removeEmpty, els.trimWhitespace, els.deduplicate, els.dedupColumn, els.validateEmail, els.emailColumn, els.normalizeDates, els.dateColumn, els.dateFormat].forEach((control) => control.addEventListener("change", () => updateUI({ announceChange: true })));
    els.downloadButton.addEventListener("click", downloadCleaned);
  }

  configureColumns();
  setFilePresentation();
  bindEvents();
  updateUI();
})();
