import { cleanRows, isEmail, issuesForOriginalRow } from "./cleaning.ts";
import { parseDate } from "./dates.ts";
import { FileProcessor, HOSTED_FILE_LIMIT_BYTES, LOCAL_FILE_LIMIT_BYTES } from "./file-processor.ts";
import { dangerousFormulaCount, safeRows } from "./security.ts";
import { findHeaderRow, headerCandidates, prepareSheet } from "./sheets.ts";
import type {
  CellValue,
  CleanedRow,
  CleaningResult,
  CleaningSettings,
  InputDateOrder,
  OutputDateFormat,
  OutputFormat,
  RowIssues
} from "./types.ts";
import { cellToString, normalizeError } from "./value.ts";

const SAMPLE_HEADERS = ["Customer ID", "Full Name", "Email", "Sign Up Date", "Amount", "Country", "Notes"];
const SAMPLE_ROWS: CellValue[][] = [
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

const THEME_STORAGE_KEY = "data-cleaner-theme";
const VIRTUAL_ROW_BUFFER = 12;
const DATE_HEADER_HINT = /\b(date|day|time|created|updated|due|deadline|start|end|birth|birthday|dob|joined)\b/i;
const EMAIL_HEADER_HINT = /\be-?mail\b/i;
const DEDUP_HEADER_HINT = /\b(e-?mail|id|identifier|code|reference|number)\b/i;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required interface element is missing: ${selector}`);
  return element;
}

const els = {
  themeToggle: required<HTMLButtonElement>("#themeToggle"),
  themeToggleLabel: required<HTMLElement>("#themeToggleLabel"),
  fileInput: required<HTMLInputElement>("#fileInput"),
  fileDrop: required<HTMLButtonElement>("#fileDrop"),
  fileName: required<HTMLElement>("#fileName"),
  fileMeta: required<HTMLElement>("#fileMeta"),
  changeFile: required<HTMLElement>("#changeFile"),
  fileError: required<HTMLElement>("#fileError"),
  fileLimit: required<HTMLElement>("#fileLimit"),
  processingStatus: required<HTMLElement>("#processingStatus"),
  processingStatusCopy: required<HTMLElement>("#processingStatusCopy"),
  outputFormat: required<HTMLSelectElement>("#outputFormat"),
  worksheet: required<HTMLSelectElement>("#worksheetSelect"),
  headerRow: required<HTMLSelectElement>("#headerRowSelect"),
  inputDateOrder: required<HTMLSelectElement>("#inputDateOrder"),
  dateFormat: required<HTMLSelectElement>("#dateFormat"),
  dateSettingsHelp: required<HTMLElement>("#dateSettingsHelp"),
  removeEmpty: required<HTMLInputElement>("#removeEmpty"),
  trimWhitespace: required<HTMLInputElement>("#trimWhitespace"),
  deduplicate: required<HTMLInputElement>("#deduplicate"),
  dedupColumn: required<HTMLSelectElement>("#dedupColumn"),
  dedupSummary: required<HTMLElement>("#dedupSummary"),
  dedupChange: required<HTMLButtonElement>("#dedupChange"),
  dedupPicker: required<HTMLElement>("#dedupPicker"),
  validateEmail: required<HTMLInputElement>("#validateEmail"),
  emailColumn: required<HTMLSelectElement>("#emailColumn"),
  emailSummary: required<HTMLElement>("#emailSummary"),
  emailChange: required<HTMLButtonElement>("#emailChange"),
  emailPicker: required<HTMLElement>("#emailPicker"),
  normalizeDates: required<HTMLInputElement>("#normalizeDates"),
  dateColumn: required<HTMLSelectElement>("#dateColumn"),
  dateSummary: required<HTMLElement>("#dateSummary"),
  dateChange: required<HTMLButtonElement>("#dateChange"),
  datePicker: required<HTMLElement>("#datePicker"),
  insights: required<HTMLElement>("#insightsPanel"),
  beforeTable: required<HTMLTableElement>("#beforeTable"),
  afterTable: required<HTMLTableElement>("#afterTable"),
  beforeCount: required<HTMLElement>("#beforeCount"),
  afterCount: required<HTMLElement>("#afterCount"),
  changedCount: required<HTMLElement>("#changedCount"),
  emptyCount: required<HTMLElement>("#emptyCount"),
  dateCount: required<HTMLElement>("#dateCount"),
  duplicateCount: required<HTMLElement>("#duplicateCount"),
  issueCount: required<HTMLElement>("#issueCount"),
  downloadButton: required<HTMLButtonElement>("#downloadButton"),
  downloadButtonLabel: required<HTMLElement>("#downloadButtonLabel"),
  downloadMeta: required<HTMLElement>("#downloadMeta"),
  announcer: required<HTMLElement>("#announcer"),
  formulaDialog: required<HTMLDialogElement>("#formulaDialog"),
  formulaDialogCopy: required<HTMLElement>("#formulaDialogCopy")
};

interface AppState {
  headers: string[];
  rows: CellValue[][];
  rawRows: CellValue[][];
  filename: string;
  fileSize: number | null;
  sheetNames: string[];
  isDemo: boolean;
  generatedHeaderCount: number;
  output: CleanedRow[];
  manualEdits: Map<string, string>;
  processing: boolean;
}

const state: AppState = {
  headers: [...SAMPLE_HEADERS],
  rows: SAMPLE_ROWS.map((row) => [...row]),
  rawRows: [[...SAMPLE_HEADERS], ...SAMPLE_ROWS.map((row) => [...row])],
  filename: "customers_dirty.csv",
  fileSize: null,
  sheetNames: [],
  isDemo: true,
  generatedHeaderCount: 0,
  output: [],
  manualEdits: new Map(),
  processing: false
};

interface VirtualController {
  frame: number;
  handleScroll: () => void;
  observer: ResizeObserver | null;
}

const virtualTables = new WeakMap<HTMLTableElement, VirtualController>();
const processor = new FileProcessor();

function announce(message: string): void {
  els.announcer.textContent = "";
  window.setTimeout(() => { els.announcer.textContent = message; }, 25);
}

function savedTheme(): "light" | "dark" | null {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "dark" || theme === "light" ? theme : null;
  } catch {
    return null;
  }
}

function systemTheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: string, options: { save?: boolean; announceChange?: boolean } = {}): void {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  const isDark = nextTheme === "dark";
  const nextAction = isDark ? "light" : "dark";
  els.themeToggle.setAttribute("aria-pressed", String(isDark));
  els.themeToggle.setAttribute("aria-label", `Switch to ${nextAction} theme`);
  els.themeToggle.title = `Switch to ${nextAction} theme`;
  els.themeToggleLabel.textContent = isDark ? "Light" : "Dark";
  if (options.save) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The choice still applies to this tab when storage is unavailable.
    }
  }
  if (options.announceChange) announce(`${isDark ? "Dark" : "Light"} theme enabled.`);
}

function initializeTheme(): void {
  applyTheme(document.documentElement.dataset.theme ?? savedTheme() ?? systemTheme());
  const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
  preference?.addEventListener("change", (event) => {
    if (!savedTheme()) applyTheme(event.matches ? "dark" : "light");
  });
}

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) return "Demo data";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function optionList(select: HTMLSelectElement, headers: readonly string[], preferred: string): void {
  const previous = select.value;
  select.replaceChildren(...headers.map((header) => new Option(header, header)));
  const candidate = headers.includes(previous) ? previous : preferred;
  select.value = candidate || "";
}

function sampleColumn(index: number): string[] {
  return state.rows.slice(0, 100).map((row) => cellToString(row[index]).trim()).filter(Boolean);
}

function matchingColumns(type: "date" | "email" | "dedup"): string[] {
  return state.headers.filter((header, index) => {
    const values = sampleColumn(index);
    const headerMatches = type === "date"
      ? DATE_HEADER_HINT.test(header)
      : type === "email"
        ? EMAIL_HEADER_HINT.test(header)
        : DEDUP_HEADER_HINT.test(header);
    if (headerMatches) return true;
    if (values.length < 2) return false;
    if (type === "date") {
      return values.filter((value) => parseDate(value, "YY-MM-DD", els.inputDateOrder.value as InputDateOrder).status === "valid").length / values.length >= 0.7;
    }
    if (type === "email") return values.filter(isEmail).length / values.length >= 0.7;
    return false;
  });
}

interface RuleAvailability {
  checkbox: HTMLInputElement;
  select: HTMLSelectElement;
  summary: HTMLElement;
  change: HTMLButtonElement;
  picker: HTMLElement;
  candidates: string[];
  preferred: string;
  resetChecked?: boolean | undefined;
  emptyCopy: string;
}

function setRuleAvailability(options: RuleAvailability): void {
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

function configureColumns(options: { resetRules?: boolean } = {}): void {
  const emailCandidates = matchingColumns("email");
  const dateCandidates = matchingColumns("date");
  const dedupCandidates = [...new Set([...emailCandidates, ...matchingColumns("dedup")])];
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

function toggleColumnPicker(picker: HTMLElement, button: HTMLButtonElement): void {
  const shouldShow = picker.hidden;
  picker.hidden = !shouldShow;
  button.setAttribute("aria-expanded", String(shouldShow));
  if (shouldShow) picker.querySelector("select")?.focus();
}

function getSettings(): CleaningSettings {
  return {
    removeEmpty: els.removeEmpty.checked,
    trimWhitespace: els.trimWhitespace.checked,
    deduplicate: els.deduplicate.checked,
    dedupColumn: els.dedupColumn.value,
    validateEmail: els.validateEmail.checked,
    emailColumn: els.emailColumn.value,
    normalizeDates: els.normalizeDates.checked,
    dateColumn: els.dateColumn.value,
    inputDateOrder: els.inputDateOrder.value as InputDateOrder,
    dateFormat: els.dateFormat.value as OutputDateFormat
  };
}

function syncDateSettings(): void {
  const hasDateRule = !els.normalizeDates.disabled;
  const enabled = hasDateRule && els.normalizeDates.checked;
  els.inputDateOrder.disabled = !enabled || state.processing;
  els.dateFormat.disabled = !enabled || state.processing;
  els.dateSettingsHelp.hidden = enabled;
  els.dateSettingsHelp.textContent = hasDateRule
    ? "Enable Normalize dates to edit these settings."
    : "No suitable date column was found.";
}

function createInsight(text: string, options: {
  tone?: "warning" | "info" | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
} = {}): HTMLElement {
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

function renderInsights(result: CleaningResult, settings: CleaningSettings): void {
  const insights: HTMLElement[] = [];
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
      actionLabel: settings.validateEmail ? undefined : "Enable validation",
      onAction: settings.validateEmail ? undefined : () => {
        els.validateEmail.checked = true;
        updateUI({ announceChange: true });
      }
    }));
  }
  if (result.diagnostics.invalidDates > 0) {
    const count = result.diagnostics.invalidDates;
    insights.push(createInsight(`${count} ${count === 1 ? "date needs" : "dates need"} review.`, {
      tone: "warning",
      actionLabel: settings.normalizeDates ? undefined : "Enable date check",
      onAction: settings.normalizeDates ? undefined : () => {
        els.normalizeDates.checked = true;
        updateUI({ announceChange: true });
      }
    }));
  }
  els.insights.replaceChildren(...insights);
  els.insights.hidden = insights.length === 0;
}

function commitManualEdit(editor: HTMLElement): void {
  const sourceIndex = Number(editor.dataset.sourceIndex);
  const columnIndex = Number(editor.dataset.columnIndex);
  const nextValue = cellToString(editor.textContent).replace(/[\r\n]+/g, " ");
  const savedValue = editor.dataset.savedValue ?? "";
  if (nextValue === savedValue) return;
  const original = cellToString(state.rows[sourceIndex]?.[columnIndex]);
  const key = `${sourceIndex}:${columnIndex}`;
  if (nextValue === original) state.manualEdits.delete(key);
  else state.manualEdits.set(key, nextValue);
  updateUI({ announceChange: true });
}

function insertPlainText(editor: HTMLElement, text: string): void {
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

function makeEditableCell(value: string, entry: CleanedRow, columnIndex: number): HTMLElement {
  const editor = document.createElement("span");
  editor.className = "cell-editor";
  editor.contentEditable = "true";
  editor.spellcheck = false;
  editor.setAttribute("role", "textbox");
  editor.tabIndex = 0;
  editor.dataset.sourceIndex = String(entry.sourceIndex);
  editor.dataset.columnIndex = String(columnIndex);
  editor.dataset.savedValue = value;
  editor.setAttribute("aria-label", `Edit row ${entry.sourceIndex + 1}, ${state.headers[columnIndex] ?? `Column ${columnIndex + 1}`}`);
  editor.textContent = value;
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      editor.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      editor.textContent = editor.dataset.savedValue ?? "";
      editor.blur();
    }
  });
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    insertPlainText(editor, event.clipboardData?.getData("text/plain") ?? "");
  });
  editor.addEventListener("blur", () => commitManualEdit(editor));
  return editor;
}

function createTableHeader(): HTMLTableSectionElement {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  const number = document.createElement("th");
  number.scope = "col";
  number.textContent = "#";
  row.append(number);
  state.headers.forEach((header) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = header;
    row.append(th);
  });
  head.append(row);
  return head;
}

type TableEntry = readonly CellValue[] | CleanedRow;

function isCleanedRow(entry: TableEntry): entry is CleanedRow {
  return !Array.isArray(entry);
}

function createDataRow(entry: TableEntry, visibleIndex: number, kind: "before" | "after"): HTMLTableRowElement {
  const cleaned = isCleanedRow(entry);
  const values = cleaned ? entry.values : entry;
  const sourceIndex = cleaned ? entry.sourceIndex : visibleIndex;
  const issues: RowIssues = cleaned ? entry.issues : issuesForOriginalRow(entry, state.headers, getSettings());
  const changed = cleaned && entry.changed;
  const row = document.createElement("tr");
  row.setAttribute("aria-rowindex", String(visibleIndex + 2));
  const number = document.createElement("td");
  number.textContent = String(sourceIndex + 1);
  row.append(number);
  values.forEach((value, columnIndex) => {
    const td = document.createElement("td");
    const display = cellToString(value);
    if (kind === "after" && cleaned) td.append(makeEditableCell(display, entry, columnIndex));
    else td.textContent = display || "—";
    const issueText = issues[columnIndex];
    if (issueText) {
      td.classList.add("warning");
      const issue = document.createElement("span");
      issue.className = "issue";
      issue.textContent = issueText;
      td.append(issue);
    } else if (kind === "after" && changed) {
      td.classList.add("changed");
    }
    row.append(td);
  });
  return row;
}

function tableRowHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--table-row-height");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 34;
}

function createSpacerRow(height: number): HTMLTableRowElement {
  const spacer = document.createElement("tr");
  spacer.className = "virtual-spacer";
  const cell = document.createElement("td");
  cell.colSpan = state.headers.length + 1;
  cell.style.height = `${height}px`;
  spacer.append(cell);
  return spacer;
}

function createTable(table: HTMLTableElement, rows: readonly TableEntry[], kind: "before" | "after"): void {
  const scroll = table.closest<HTMLElement>(".table-scroll");
  if (!scroll) throw new Error("A data table is missing its scroll container.");
  const previous = virtualTables.get(table);
  if (previous) {
    scroll.removeEventListener("scroll", previous.handleScroll);
    previous.observer?.disconnect();
    if (previous.frame) window.cancelAnimationFrame(previous.frame);
  }

  table.replaceChildren(createTableHeader());
  table.setAttribute("aria-rowcount", String(rows.length + 1));
  const controller: VirtualController = { frame: 0, handleScroll: () => undefined, observer: null };

  const renderVisibleRows = (): void => {
    const rowHeight = tableRowHeight();
    const viewportHeight = scroll.clientHeight || 400;
    const maximumScroll = Math.max(0, (rows.length + 1) * rowHeight - viewportHeight);
    if (scroll.scrollTop > maximumScroll) scroll.scrollTop = maximumScroll;
    const bodyScrollTop = Math.max(0, scroll.scrollTop - rowHeight);
    const firstVisible = Math.floor(bodyScrollTop / rowHeight);
    const visibleRows = Math.ceil(viewportHeight / rowHeight);
    const start = Math.max(0, firstVisible - VIRTUAL_ROW_BUFFER);
    const end = Math.min(rows.length, firstVisible + visibleRows + VIRTUAL_ROW_BUFFER);
    const body = document.createElement("tbody");
    if (start > 0) body.append(createSpacerRow(start * rowHeight));
    rows.slice(start, end).forEach((entry, index) => body.append(createDataRow(entry, start + index, kind)));
    if (end < rows.length) body.append(createSpacerRow((rows.length - end) * rowHeight));
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

function updateUI(options: { announceChange?: boolean } = {}): void {
  syncDateSettings();
  const settings = getSettings();
  const result = cleanRows(state.headers, state.rows, settings, state.manualEdits);
  state.output = result.output;
  createTable(els.beforeTable, state.rows, "before");
  createTable(els.afterTable, result.output, "after");
  els.beforeCount.textContent = `${state.rows.length} rows`;
  els.afterCount.textContent = `${result.output.length} rows`;
  els.changedCount.textContent = String(result.summary.changedRows);
  els.emptyCount.textContent = String(result.summary.emptyRows);
  els.dateCount.textContent = String(result.summary.normalizedDates);
  els.duplicateCount.textContent = String(result.summary.duplicateRows);
  els.issueCount.textContent = String(result.summary.invalidEmails + result.summary.invalidDates);
  const extension = (els.outputFormat.value as OutputFormat).toUpperCase();
  els.downloadMeta.textContent = `${extension} · ${result.output.length} rows · ${state.isDemo ? "demo data" : "ready to download"}`;
  renderInsights(result, settings);
  if (options.announceChange) {
    announce(`${result.output.length} cleaned rows ready. ${result.summary.invalidEmails + result.summary.invalidDates} values need review.`);
  }
}

function setFilePresentation(): void {
  els.fileName.textContent = state.filename;
  els.fileMeta.textContent = `${fileSizeLabel(state.fileSize)} · ${state.rows.length} rows`;
  els.changeFile.textContent = state.isDemo ? "Choose file" : "Change file";
}

function setProcessing(processing: boolean, message = "Processing file…"): void {
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

function showFileError(message: string): void {
  els.fileError.textContent = message;
  els.fileError.hidden = false;
  announce(message);
}

function clearFileError(): void {
  els.fileError.textContent = "";
  els.fileError.hidden = true;
}

function populateHeaderRows(rawRows: readonly (readonly CellValue[])[], selectedIndex: number): void {
  const candidates = headerCandidates(rawRows);
  els.headerRow.replaceChildren(...candidates.map(({ index, preview }) => new Option(`Row ${index + 1} — ${preview}`, String(index))));
  els.headerRow.value = String(selectedIndex);
  els.headerRow.disabled = candidates.length < 2 || state.processing;
}

function adoptSheet(rawRows: CellValue[][], headerIndex: number): void {
  const prepared = prepareSheet(rawRows, headerIndex);
  state.headers = prepared.headers;
  state.rows = prepared.rows;
  state.generatedHeaderCount = prepared.generatedHeaderCount;
  state.manualEdits.clear();
  configureColumns({ resetRules: true });
  setFilePresentation();
  updateUI({ announceChange: true });
}

function loadActiveSheet(rawRows: CellValue[][]): void {
  const headerIndex = findHeaderRow(rawRows);
  state.rawRows = rawRows;
  populateHeaderRows(rawRows, headerIndex);
  adoptSheet(rawRows, headerIndex);
}

function outputFormatForFile(name: string): OutputFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  throw new Error("Choose a .csv or .xlsx file.");
}

async function loadFile(file: File): Promise<void> {
  const fileType = outputFormatForFile(file.name);
  const limit = processor.supportsBackgroundProcessing ? HOSTED_FILE_LIMIT_BYTES : LOCAL_FILE_LIMIT_BYTES;
  if (file.size > limit) {
    const limitLabel = processor.supportsBackgroundProcessing ? "50 MB" : "10 MB";
    const recovery = processor.supportsBackgroundProcessing
      ? "Choose a smaller file."
      : "Open the GitHub Pages version to process files up to 50 MB in the background.";
    throw new Error(`This file is larger than the ${limitLabel} limit for this mode. ${recovery}`);
  }

  setProcessing(true, "Reading and checking your file…");
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await processor.load(fileType, buffer);
    state.filename = file.name;
    state.fileSize = file.size;
    state.isDemo = false;
    state.sheetNames = [...parsed.sheetNames];
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

async function onWorksheetChange(): Promise<void> {
  const sheetName = els.worksheet.value;
  if (!sheetName || sheetName === "csv") return;
  setProcessing(true, `Loading ${sheetName}…`);
  try {
    const rows = await processor.selectSheet(sheetName) as CellValue[][];
    clearFileError();
    loadActiveSheet(rows);
  } catch (error) {
    showFileError(normalizeError(error));
  } finally {
    setProcessing(false);
  }
}

function onHeaderRowChange(): void {
  try {
    adoptSheet(state.rawRows, Number(els.headerRow.value));
    clearFileError();
  } catch (error) {
    showFileError(normalizeError(error));
  }
}

function triggerDownload(buffer: ArrayBuffer, mime: string, name: string): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadCleaned(options: { safe?: boolean } = {}): Promise<void> {
  const rawRows: CellValue[][] = [state.headers, ...state.output.map((entry) => entry.values)];
  const rows = options.safe ? safeRows(rawRows) : rawRows.map((row) => row.map(cellToString));
  const format = els.outputFormat.value as OutputFormat;
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
  } finally {
    els.downloadButton.disabled = false;
    els.downloadButton.removeAttribute("aria-busy");
    els.downloadButtonLabel.textContent = originalLabel;
  }
}

function requestDownload(): void {
  const rows: CellValue[][] = [state.headers, ...state.output.map((entry) => entry.values)];
  const formulaCount = dangerousFormulaCount(rows);
  if (!formulaCount) {
    void downloadCleaned();
    return;
  }
  els.formulaDialogCopy.textContent = `${formulaCount} ${formulaCount === 1 ? "cell looks" : "cells look"} like spreadsheet formulas. The safe version stores them as plain text; choose original only if you trust the data.`;
  els.formulaDialog.returnValue = "";
  els.formulaDialog.showModal();
}

function handleFile(file: File | undefined): void {
  if (!file) return;
  void loadFile(file).catch((error) => {
    showFileError(normalizeError(error));
    els.fileInput.value = "";
    setProcessing(false);
  });
}

function bindEvents(): void {
  els.themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", { save: true, announceChange: true });
  });
  els.fileDrop.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => handleFile(els.fileInput.files?.[0]));
  ["dragenter", "dragover"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!state.processing) els.fileDrop.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => els.fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.fileDrop.classList.remove("is-dragover");
  }));
  els.fileDrop.addEventListener("drop", (event) => {
    if (!state.processing) handleFile(event.dataTransfer?.files[0]);
  });
  els.worksheet.addEventListener("change", () => { void onWorksheetChange(); });
  els.headerRow.addEventListener("change", onHeaderRowChange);
  els.outputFormat.addEventListener("change", () => updateUI());
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
  ].forEach((control) => control.addEventListener("change", () => {
    configureColumns();
    updateUI({ announceChange: true });
  }));
  els.inputDateOrder.addEventListener("change", () => {
    configureColumns();
    updateUI({ announceChange: true });
  });
  const columnPickers: Array<[HTMLElement, HTMLButtonElement]> = [
    [els.dedupPicker, els.dedupChange],
    [els.emailPicker, els.emailChange],
    [els.datePicker, els.dateChange]
  ];
  columnPickers.forEach(([picker, button]) => button.addEventListener("click", () => toggleColumnPicker(picker, button)));
  els.downloadButton.addEventListener("click", requestDownload);
  els.formulaDialog.addEventListener("close", () => {
    if (els.formulaDialog.returnValue === "safe") void downloadCleaned({ safe: true });
    if (els.formulaDialog.returnValue === "original") void downloadCleaned();
  });
  window.addEventListener("beforeunload", () => processor.dispose(), { once: true });
}

function initialize(): void {
  els.fileLimit.textContent = processor.supportsBackgroundProcessing
    ? "Files up to 50 MB are processed in the background. Larger files may take longer."
    : "Direct-open mode supports files up to 10 MB. Use the GitHub Pages version for files up to 50 MB.";
  populateHeaderRows(state.rawRows, 0);
  initializeTheme();
  configureColumns({ resetRules: true });
  setFilePresentation();
  bindEvents();
  updateUI();
}

initialize();
