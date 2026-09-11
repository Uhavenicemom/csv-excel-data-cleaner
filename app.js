(() => {
  "use strict";

  const SAMPLE_HEADERS = ["Customer ID", "Full Name", "Email", "Sign Up Date", "Amount", "Country", "Notes"];
  const FILE_LIMIT_BYTES = 50 * 1024 * 1024;
  const HEADER_SCAN_LIMIT = 20;
  const TABLE_HEADER_HEIGHT = 34;
  const TABLE_ROW_HEIGHT = 34;
  const VIRTUAL_ROW_BUFFER = 12;
  const DANGEROUS_FORMULA = /^[=+\-@]/;
  const DATE_HEADER_HINT = /\b(date|day|time|created|updated|due|deadline|start|end|birth|birthday|dob|joined)\b/i;
  const EMAIL_HEADER_HINT = /\be-?mail\b/i;
  const DEDUP_HEADER_HINT = /\b(e-?mail|id|identifier|code|reference|number)\b/i;
  const SAMPLE_ROWS = [
    ["C-1042", "  Ava Nguyen  ", " ava.nguyen@example.com ", "2025/01/04", "99.00", "USA", "First order"],
    ["C-1043", "Mateo Silva", "mateo.silva@example.com", "04-01-25", "149", "Brazil", "Asked for invoice"],
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
    ["C-1056", "  Chloe Martin", " chloe.martin@example.com", "2025/01/16", "149.50", "Czechia", "Follow-up"],
    ["C-1057", "Nia Brooks", "nia.brooks@example.com", "2025-01-17", "220", "USA", " "],
    ["C-1058", "Carlos Torres", "ryo.tanaka@example.com", "17/01/2025", "300", "Mexico", "Duplicate email"]
  ];

  const els = {
    fileInput: document.querySelector("#fileInput"),
    fileDrop: document.querySelector("#fileDrop"),
    fileName: document.querySelector("#fileName"),
    fileMeta: document.querySelector("#fileMeta"),
    changeFile: document.querySelector("#changeFile"),
    fileError: document.querySelector("#fileError"),
    outputFormat: document.querySelector("#outputFormat"),
    worksheet: document.querySelector("#worksheetSelect"),
    headerRow: document.querySelector("#headerRowSelect"),
    inputDateOrder: document.querySelector("#inputDateOrder"),
    dateFormat: document.querySelector("#dateFormat"),
    dateSettingsHelp: document.querySelector("#dateSettingsHelp"),
    removeEmpty: document.querySelector("#removeEmpty"),
    trimWhitespace: document.querySelector("#trimWhitespace"),
    deduplicate: document.querySelector("#deduplicate"),
    dedupColumn: document.querySelector("#dedupColumn"),
    dedupSummary: document.querySelector("#dedupSummary"),
    dedupChange: document.querySelector("#dedupChange"),
    dedupPicker: document.querySelector("#dedupPicker"),
    validateEmail: document.querySelector("#validateEmail"),
    emailColumn: document.querySelector("#emailColumn"),
    emailSummary: document.querySelector("#emailSummary"),
    emailChange: document.querySelector("#emailChange"),
    emailPicker: document.querySelector("#emailPicker"),
    normalizeDates: document.querySelector("#normalizeDates"),
    dateColumn: document.querySelector("#dateColumn"),
    dateSummary: document.querySelector("#dateSummary"),
    dateChange: document.querySelector("#dateChange"),
    datePicker: document.querySelector("#datePicker"),
    insights: document.querySelector("#insightsPanel"),
    beforeTable: document.querySelector("#beforeTable"),
    afterTable: document.querySelector("#afterTable"),
    beforeCount: document.querySelector("#beforeCount"),
    afterCount: document.querySelector("#afterCount"),
    changedCount: document.querySelector("#changedCount"),
    emptyCount: document.querySelector("#emptyCount"),
    dateCount: document.querySelector("#dateCount"),
    duplicateCount: document.querySelector("#duplicateCount"),
    issueCount: document.querySelector("#issueCount"),
    downloadButton: document.querySelector("#downloadButton"),
    downloadMeta: document.querySelector("#downloadMeta"),
    announcer: document.querySelector("#announcer"),
    formulaDialog: document.querySelector("#formulaDialog"),
    formulaDialogCopy: document.querySelector("#formulaDialogCopy")
  };

  const state = {
    headers: [...SAMPLE_HEADERS],
    rows: SAMPLE_ROWS.map((row) => [...row]),
    rawRows: [SAMPLE_HEADERS, ...SAMPLE_ROWS].map((row) => [...row]),
    filename: "customers_dirty.csv",
    fileSize: null,
    sheets: {},
    isDemo: true,
    output: [],
    manualEdits: new Map()
  };
  const virtualTables = new WeakMap();

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

  function parseDate(value, outputFormat, inputDateOrder) {
    const source = cleanValue(value).trim();
    if (!source) return { status: "empty" };
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(source)) {
      const [year, month, day] = source.split(/[/-]/).map(Number);
      return isValidDate(year, month, day) ? { status: "valid", value: formatDate({ year, month, day }, outputFormat) } : { status: "invalid" };
    }
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(source)) {
      const [first, second, yearRaw] = source.split(/[/-]/).map(Number);
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      const numericOrder = first > 12 && second <= 12
        ? "DD-MM-YY"
        : second > 12 && first <= 12
          ? "MM-DD-YY"
          : inputDateOrder;
      const [month, day] = numericOrder === "MM-DD-YY" ? [first, second] : [second, first];
      return isValidDate(year, month, day) ? { status: "valid", value: formatDate({ year, month, day }, outputFormat) } : { status: "invalid" };
    }
    const months = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
      may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
      september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };
    const monthFirst = source.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/i);
    const dayFirst = source.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?[,]?\s+(\d{4})$/i);
    const month = monthFirst ? months[monthFirst[1].toLowerCase()] : dayFirst ? months[dayFirst[2].toLowerCase()] : null;
    const day = monthFirst ? Number(monthFirst[2]) : dayFirst ? Number(dayFirst[1]) : null;
    const year = monthFirst ? Number(monthFirst[3]) : dayFirst ? Number(dayFirst[3]) : null;
    if (!month || !isValidDate(year, month, day)) return { status: "invalid" };
    return { status: "valid", value: formatDate({ year, month, day }, outputFormat) };
  }

  function fileSizeLabel(bytes) {
    if (!bytes) return "Demo data · 10 rows";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function optionList(select, headers, preferred) {
    const previous = select.value;
    select.replaceChildren();
    headers.forEach((header) => select.add(new Option(header, header)));
    const candidate = headers.includes(previous) ? previous : preferred;
    select.value = candidate || "";
  }

  function sampleColumn(index) {
    return state.rows.slice(0, 100).map((row) => cleanValue(row[index]).trim()).filter(Boolean);
  }

  function matchingColumns(type) {
    return state.headers.filter((header, index) => {
      const values = sampleColumn(index);
      const headerMatches = type === "date" ? DATE_HEADER_HINT.test(header) : type === "email" ? EMAIL_HEADER_HINT.test(header) : DEDUP_HEADER_HINT.test(header);
      if (headerMatches) return true;
      if (values.length < 2) return false;
      if (type === "date") return values.filter((value) => parseDate(value, "YY-MM-DD", els.inputDateOrder.value).status === "valid").length / values.length >= 0.7;
      if (type === "email") return values.filter(isEmail).length / values.length >= 0.7;
      return false;
    });
  }

  function setRuleAvailability({ checkbox, select, summary, change, picker, candidates, preferred, resetChecked, emptyCopy }) {
    const hasCandidates = candidates.length > 0;
    optionList(select, candidates, preferred);
    checkbox.disabled = !hasCandidates;
    if (!hasCandidates) checkbox.checked = false;
    if (resetChecked !== undefined) checkbox.checked = resetChecked && hasCandidates;
    summary.textContent = hasCandidates ? `Using ${select.value}` : emptyCopy;
    change.hidden = candidates.length <= 1;
    change.disabled = candidates.length <= 1;
    picker.hidden = true;
    change.setAttribute("aria-expanded", "false");
  }

  function configureColumns({ resetRules = false } = {}) {
    const emailCandidates = matchingColumns("email");
    const dateCandidates = matchingColumns("date");
    const dedupCandidates = [...new Set([...emailCandidates, ...matchingColumns("dedup")])];
    setRuleAvailability({ checkbox: els.deduplicate, select: els.dedupColumn, summary: els.dedupSummary, change: els.dedupChange, picker: els.dedupPicker, candidates: dedupCandidates, preferred: emailCandidates[0] || dedupCandidates[0] || "", resetChecked: resetRules ? false : undefined, emptyCopy: "No safe column found" });
    setRuleAvailability({ checkbox: els.validateEmail, select: els.emailColumn, summary: els.emailSummary, change: els.emailChange, picker: els.emailPicker, candidates: emailCandidates, preferred: emailCandidates[0] || "", resetChecked: resetRules ? true : undefined, emptyCopy: "No email column found" });
    setRuleAvailability({ checkbox: els.normalizeDates, select: els.dateColumn, summary: els.dateSummary, change: els.dateChange, picker: els.datePicker, candidates: dateCandidates, preferred: dateCandidates[0] || "", resetChecked: resetRules ? true : undefined, emptyCopy: "No date columns found" });
  }

  function toggleColumnPicker(picker, button) {
    const shouldShow = picker.hidden;
    picker.hidden = !shouldShow;
    button.setAttribute("aria-expanded", String(shouldShow));
    if (shouldShow) picker.querySelector("select").focus();
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
    els.inputDateOrder.disabled = !enabled;
    els.dateFormat.disabled = !enabled;
    els.dateSettingsHelp.hidden = enabled;
    els.dateSettingsHelp.textContent = hasDateRule
      ? "Enable Normalize dates to edit these settings."
      : "No suitable date column was found.";
  }

  function cleanRows() {
    const settings = getSettings();
    const dedupIndex = state.headers.indexOf(settings.dedupColumn);
    const emailIndex = state.headers.indexOf(settings.emailColumn);
    const dateIndex = state.headers.indexOf(settings.dateColumn);
    const seen = new Set();
    const summary = { changedRows: 0, emptyRows: 0, duplicateRows: 0, invalidEmails: 0, invalidDates: 0, normalizedDates: 0 };
    const output = [];

    state.rows.forEach((original, sourceIndex) => {
      const row = original.map(cleanValue);
      const issues = {};
      let changed = false;

      row.forEach((value, index) => {
        const manualValue = state.manualEdits.get(`${sourceIndex}:${index}`);
        if (manualValue !== undefined && manualValue !== value) {
          row[index] = manualValue;
          changed = true;
        }
      });

      if (settings.trimWhitespace) {
        row.forEach((value, index) => {
          const trimmed = value.trim();
          if (trimmed !== value) {
            row[index] = trimmed;
            changed = true;
          }
        });
      }

      if (settings.removeEmpty && isBlankRow(row)) {
        summary.emptyRows += 1;
        return;
      }

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
        const result = parseDate(row[dateIndex], settings.dateFormat, settings.inputDateOrder);
        if (result.status === "valid" && result.value !== row[dateIndex]) {
          row[dateIndex] = result.value;
          summary.normalizedDates += 1;
          changed = true;
        } else if (result.status === "invalid") {
          issues[dateIndex] = "Invalid date";
          summary.invalidDates += 1;
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
      const result = parseDate(row[dateIndex], settings.dateFormat, settings.inputDateOrder);
      if (result.status === "invalid") issues[dateIndex] = "Invalid date";
    }
    return issues;
  }

  function duplicateTotal(columnIndex) {
    if (columnIndex < 0) return 0;
    const seen = new Set();
    let duplicates = 0;
    state.rows.forEach((row) => {
      const key = cleanValue(row[columnIndex]).trim().toLocaleLowerCase();
      if (!key) return;
      if (seen.has(key)) duplicates += 1;
      else seen.add(key);
    });
    return duplicates;
  }

  function invalidTotal(columnIndex, validator) {
    if (columnIndex < 0) return 0;
    return state.rows.reduce((total, row) => {
      const value = cleanValue(row[columnIndex]).trim();
      return total + (value && !validator(value) ? 1 : 0);
    }, 0);
  }

  function createInsight({ tone = "", text, actionLabel, onAction }) {
    const item = document.createElement("div");
    item.className = `insight ${tone}`.trim();
    const copy = document.createElement("span");
    copy.textContent = text;
    item.append(copy);
    if (actionLabel && onAction) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "insight-action";
      action.textContent = actionLabel;
      action.addEventListener("click", onAction);
      item.append(action);
    }
    return item;
  }

  function renderInsights(settings) {
    const insights = [];
    const dedupIndex = state.headers.indexOf(settings.dedupColumn);
    const emailIndex = state.headers.indexOf(settings.emailColumn);
    const dateIndex = state.headers.indexOf(settings.dateColumn);
    const duplicates = duplicateTotal(dedupIndex);
    const invalidEmails = invalidTotal(emailIndex, isEmail);
    const invalidDates = invalidTotal(dateIndex, (value) => parseDate(value, settings.dateFormat, settings.inputDateOrder).status === "valid");

    if (duplicates) {
      insights.push(createInsight({ tone: "warning", text: `${duplicates} duplicate ${duplicates === 1 ? "value" : "values"} found in ${settings.dedupColumn}.`, actionLabel: settings.deduplicate ? "Rule enabled" : "Enable de-duplicate", onAction: settings.deduplicate ? null : () => { els.deduplicate.checked = true; updateUI({ announceChange: true }); } }));
    }
    if (invalidEmails) {
      insights.push(createInsight({ tone: "warning", text: `${invalidEmails} ${invalidEmails === 1 ? "email needs" : "emails need"} review.`, actionLabel: settings.validateEmail ? null : "Enable validation", onAction: () => { els.validateEmail.checked = true; updateUI({ announceChange: true }); } }));
    }
    if (invalidDates) {
      insights.push(createInsight({ tone: "warning", text: `${invalidDates} ${invalidDates === 1 ? "date needs" : "dates need"} review.`, actionLabel: settings.normalizeDates ? null : "Enable date check", onAction: () => { els.normalizeDates.checked = true; updateUI({ announceChange: true }); } }));
    }
    els.insights.replaceChildren(...insights);
    els.insights.hidden = insights.length === 0;
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

  function insertPlainText(editor, text) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      editor.textContent += text;
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
      insertPlainText(editor, event.clipboardData.getData("text/plain"));
    });
    editor.addEventListener("blur", () => commitManualEdit(editor));
    return editor;
  }

  function createTableHeader() {
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
    return head;
  }

  function createDataRow(entry, index, kind) {
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
    return tr;
  }

  function createSpacerRow(height) {
    const spacer = document.createElement("tr");
    spacer.className = "virtual-spacer";
    const cell = document.createElement("td");
    cell.colSpan = state.headers.length + 1;
    cell.style.height = `${height}px`;
    spacer.append(cell);
    return spacer;
  }

  function createTable(table, rows, kind) {
    const scroll = table.closest(".table-scroll");
    const previous = virtualTables.get(table);
    if (previous) {
      scroll.removeEventListener("scroll", previous.handleScroll);
      if (previous.frame) window.cancelAnimationFrame(previous.frame);
    }

    const head = createTableHeader();
    table.replaceChildren(head);
    table.setAttribute("aria-rowcount", String(rows.length + 1));

    const controller = { frame: 0, handleScroll: null };
    const renderVisibleRows = () => {
      const viewportHeight = scroll.clientHeight || 400;
      const totalHeight = TABLE_HEADER_HEIGHT + rows.length * TABLE_ROW_HEIGHT;
      const maximumScroll = Math.max(0, totalHeight - viewportHeight);
      if (scroll.scrollTop > maximumScroll) scroll.scrollTop = maximumScroll;

      const bodyScrollTop = Math.max(0, scroll.scrollTop - TABLE_HEADER_HEIGHT);
      const firstVisible = Math.floor(bodyScrollTop / TABLE_ROW_HEIGHT);
      const visibleRows = Math.ceil(viewportHeight / TABLE_ROW_HEIGHT);
      const start = Math.max(0, firstVisible - VIRTUAL_ROW_BUFFER);
      const end = Math.min(rows.length, firstVisible + visibleRows + VIRTUAL_ROW_BUFFER);
      const body = document.createElement("tbody");
      if (start > 0) body.append(createSpacerRow(start * TABLE_ROW_HEIGHT));
      rows.slice(start, end).forEach((entry, index) => body.append(createDataRow(entry, start + index, kind)));
      if (end < rows.length) body.append(createSpacerRow((rows.length - end) * TABLE_ROW_HEIGHT));
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
    virtualTables.set(table, controller);
    scroll.addEventListener("scroll", controller.handleScroll, { passive: true });
    renderVisibleRows();
  }

  function updateUI({ announceChange = false } = {}) {
    syncDateSettings();
    const result = cleanRows();
    state.output = result.output;
    createTable(els.beforeTable, state.rows, "before");
    createTable(els.afterTable, result.output, "after");

    els.beforeCount.textContent = `${state.rows.length} rows`;
    els.afterCount.textContent = `${result.output.length} rows`;
    els.changedCount.textContent = result.summary.changedRows;
    els.emptyCount.textContent = result.summary.emptyRows;
    els.dateCount.textContent = result.summary.normalizedDates;
    els.duplicateCount.textContent = result.summary.duplicateRows;
    els.issueCount.textContent = result.summary.invalidEmails + result.summary.invalidDates;
    const extension = els.outputFormat.value.toUpperCase();
    els.downloadMeta.textContent = `${extension} · ${result.output.length} rows · ${state.isDemo ? "demo data" : "ready to download"}`;
    renderInsights(getSettings());
    if (announceChange) announce(`${result.output.length} cleaned rows ready. ${result.summary.invalidEmails + result.summary.invalidDates} values need review.`);
  }

  function setFilePresentation() {
    els.fileName.textContent = state.filename;
    els.fileMeta.textContent = `${state.isDemo ? "Demo data" : fileSizeLabel(state.fileSize)} · ${state.rows.length} rows`;
    els.changeFile.textContent = state.isDemo ? "Choose file" : "Change file";
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

  function detectCsvDelimiter(text) {
    let commas = 0;
    let semicolons = 0;
    let inQuotes = false;
    let lines = 0;
    for (let index = 0; index < text.length && lines < 12; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (inQuotes && text[index + 1] === '"') index += 1;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && character === ",") commas += 1;
      else if (!inQuotes && character === ";") semicolons += 1;
      else if (!inQuotes && (character === "\n" || character === "\r")) lines += 1;
    }
    return semicolons > commas ? ";" : ",";
  }

  function csvToRows(text) {
    const source = cleanValue(text).replace(/^\uFEFF/, "");
    const delimiter = detectCsvDelimiter(source);
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') {
        if (inQuotes && source[index + 1] === '"') { cell += '"'; index += 1; }
        else inQuotes = !inQuotes;
      } else if (character === delimiter && !inQuotes) { row.push(cell); cell = ""; }
      else if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(cell);
        rows.push(row);
        row = []; cell = "";
      } else cell += character;
    }
    if (inQuotes) throw new Error("This CSV has an unmatched quotation mark.");
    row.push(cell);
    if (row.some((value) => value !== "") || cell !== "") rows.push(row);
    return rows;
  }

  function uniqueHeaders(headerRow) {
    const seen = new Map();
    return headerRow.map((value, index) => {
      const base = cleanValue(value).trim() || `Column ${index + 1}`;
      const occurrence = (seen.get(base) || 0) + 1;
      seen.set(base, occurrence);
      return occurrence === 1 ? base : `${base} (${occurrence})`;
    });
  }

  function rowPreview(row) {
    return row.map(cleanValue).map((value) => value.trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 54) || "Empty row";
  }

  function headerCandidates(rawRows) {
    return rawRows.slice(0, HEADER_SCAN_LIMIT).map((row, index) => ({
      index,
      nonEmpty: row.filter((cell) => cleanValue(cell).trim()).length,
      preview: rowPreview(row)
    })).filter((row) => row.nonEmpty > 0);
  }

  function findHeaderRow(rawRows) {
    const candidates = headerCandidates(rawRows);
    if (!candidates.length) throw new Error("This worksheet is empty.");
    return candidates.reduce((best, candidate) => candidate.nonEmpty > best.nonEmpty ? candidate : best).index;
  }

  function populateHeaderRows(rawRows, selectedIndex) {
    const candidates = headerCandidates(rawRows);
    els.headerRow.replaceChildren(...candidates.map(({ index, preview }) => new Option(`Row ${index + 1} — ${preview}`, String(index))));
    els.headerRow.value = String(selectedIndex);
    els.headerRow.disabled = candidates.length < 2;
  }

  function adoptSheet(rawRows, headerIndex) {
    if (!rawRows[headerIndex]) throw new Error("Choose a valid header row.");
    const headerRow = uniqueHeaders(rawRows[headerIndex]);
    const width = headerRow.length;
    state.headers = headerRow;
    state.rows = rawRows.slice(headerIndex + 1).map((row) => Array.from({ length: width }, (_, index) => cleanValue(row[index])));
    state.manualEdits.clear();
    configureColumns({ resetRules: true });
    setFilePresentation();
    updateUI({ announceChange: true });
  }

  function loadActiveSheet(rawRows) {
    const headerIndex = findHeaderRow(rawRows);
    state.rawRows = rawRows;
    populateHeaderRows(rawRows, headerIndex);
    adoptSheet(rawRows, headerIndex);
  }

  async function loadFile(file) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
      throw new Error("Choose a .csv or .xlsx file.");
    }
    if (file.size > FILE_LIMIT_BYTES) throw new Error("This file is larger than 50 MB. Choose a smaller file to keep your browser responsive.");
    let sheets = {};
    let activeSheet;
    let isCsv = lowerName.endsWith(".csv");
    if (isCsv) {
      activeSheet = csvToRows(await file.text());
    } else {
      if (!window.XLSX) throw new Error("Excel support is unavailable. Please try again once the local Excel library is installed.");
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      if (!workbook.SheetNames.length) throw new Error("This Excel file has no worksheets.");
      workbook.SheetNames.forEach((name) => { sheets[name] = window.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" }); });
      activeSheet = sheets[workbook.SheetNames[0]];
    }
    findHeaderRow(activeSheet);
    state.filename = file.name;
    state.fileSize = file.size;
    state.isDemo = false;
    state.sheets = sheets;
    if (isCsv) {
      els.worksheet.replaceChildren(new Option("Not needed for CSV", "csv"));
      els.worksheet.disabled = true;
    } else {
      els.worksheet.replaceChildren(...Object.keys(sheets).map((name) => new Option(name, name)));
      els.worksheet.disabled = false;
    }
    clearFileError();
    loadActiveSheet(activeSheet);
  }

  function onWorksheetChange() {
    if (state.sheets[els.worksheet.value]) loadActiveSheet(state.sheets[els.worksheet.value]);
  }

  function onHeaderRowChange() {
    try {
      adoptSheet(state.rawRows, Number(els.headerRow.value));
      clearFileError();
    } catch (error) {
      showFileError(error.message);
    }
  }

  function csvEscape(value) {
    const source = cleanValue(value);
    return /[",\n\r]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
  }

  function dangerousFormulaCount(rows) {
    return rows.reduce((total, row) => total + row.filter((value) => DANGEROUS_FORMULA.test(cleanValue(value))).length, 0);
  }

  function safeCell(value) {
    const source = cleanValue(value);
    return DANGEROUS_FORMULA.test(source) ? `'${source}` : source;
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

  function downloadCleaned({ safe = false } = {}) {
    const rawRows = [state.headers, ...state.output.map((entry) => entry.values)];
    const rows = safe ? rawRows.map((row) => row.map(safeCell)) : rawRows;
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
    announce(safe ? "Your safe cleaned file download has started." : "Your cleaned file download has started.");
  }

  function requestDownload() {
    const rows = [state.headers, ...state.output.map((entry) => entry.values)];
    const formulaCount = dangerousFormulaCount(rows);
    if (!formulaCount) {
      downloadCleaned();
      return;
    }
    els.formulaDialogCopy.textContent = `${formulaCount} ${formulaCount === 1 ? "cell begins" : "cells begin"} with a spreadsheet formula character. A safe download turns them into plain text.`;
    els.formulaDialog.returnValue = "";
    els.formulaDialog.showModal();
  }

  function handleFile(file) {
    if (!file) return;
    loadFile(file).catch((error) => {
      showFileError(error.message);
      els.fileInput.value = "";
    });
  }

  function bindEvents() {
    els.fileDrop.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
    ["dragenter", "dragover"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => { event.preventDefault(); els.fileDrop.classList.add("is-dragover"); }));
    ["dragleave", "drop"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => { event.preventDefault(); els.fileDrop.classList.remove("is-dragover"); }));
    els.fileDrop.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
    els.worksheet.addEventListener("change", onWorksheetChange);
    els.headerRow.addEventListener("change", onHeaderRowChange);
    els.outputFormat.addEventListener("change", () => updateUI());
    [els.removeEmpty, els.trimWhitespace, els.deduplicate, els.dedupColumn, els.validateEmail, els.emailColumn, els.normalizeDates, els.dateColumn, els.dateFormat].forEach((control) => control.addEventListener("change", () => {
      configureColumns();
      updateUI({ announceChange: true });
    }));
    els.inputDateOrder.addEventListener("change", () => {
      configureColumns();
      updateUI({ announceChange: true });
    });
    [[els.dedupPicker, els.dedupChange], [els.emailPicker, els.emailChange], [els.datePicker, els.dateChange]].forEach(([picker, button]) => button.addEventListener("click", () => toggleColumnPicker(picker, button)));
    els.downloadButton.addEventListener("click", requestDownload);
    els.formulaDialog.addEventListener("close", () => {
      if (els.formulaDialog.returnValue === "safe") downloadCleaned({ safe: true });
      if (els.formulaDialog.returnValue === "original") downloadCleaned();
    });
  }

  populateHeaderRows(state.rawRows, 0);
  configureColumns({ resetRules: true });
  setFilePresentation();
  bindEvents();
  updateUI();
})();

