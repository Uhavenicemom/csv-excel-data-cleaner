import { createZip } from "./archive.ts";
import {
  batchOutputFormat,
  cleanupReportCsv,
  MAX_BATCH_CELLS,
  MAX_BATCH_FILES,
  uniqueArchiveName,
  validateBatchSelection,
  type BatchReportEntry,
  type BatchStatus
} from "./batch.ts";
import { cleanRows, issuesForOriginalRow } from "./cleaning.ts";
import { detectColumnCandidates, type ColumnCandidates } from "./columns.ts";
import { SAMPLE_HEADERS, SAMPLE_ROWS } from "./demo-data.ts";
import { emailCellKey } from "./email-domains.ts";
import { FileProcessor, HOSTED_FILE_LIMIT_BYTES, LOCAL_FILE_LIMIT_BYTES } from "./file-processor.ts";
import { assertCellLength } from "./limits.ts";
import {
  DEFAULT_PRESET,
  deleteNamedPreset,
  emptyPresetStore,
  readPresetStore,
  upsertNamedPreset,
  writePresetStore,
  type PresetStore
} from "./presets.ts";
import { dangerousFormulaCount, safeRows } from "./security.ts";
import { findHeaderRow, headerCandidates, prepareSheet } from "./sheets.ts";
import { renderTable } from "./table-view.ts";
import { createThemeController } from "./theme.ts";
import type {
  CellValue,
  BatchOutputMode,
  CleanedRow,
  CleaningResult,
  CleaningSummary,
  CleaningSettings,
  InputDateOrder,
  OutputDateFormat,
  OutputFormat,
  PresetSettings
} from "./types.ts";
import { cellToString, normalizeError } from "./value.ts";

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
  presetSelect: required<HTMLSelectElement>("#presetSelect"),
  presetSave: required<HTMLButtonElement>("#presetSave"),
  presetDelete: required<HTMLButtonElement>("#presetDelete"),
  presetReset: required<HTMLButtonElement>("#presetReset"),
  presetForm: required<HTMLFormElement>("#presetForm"),
  presetName: required<HTMLInputElement>("#presetName"),
  presetCancel: required<HTMLButtonElement>("#presetCancel"),
  batchPanel: required<HTMLElement>("#batchPanel"),
  batchSummary: required<HTMLElement>("#batchSummary"),
  batchQueue: required<HTMLElement>("#batchQueue"),
  batchOutputMode: required<HTMLSelectElement>("#batchOutputMode"),
  batchCancel: required<HTMLButtonElement>("#batchCancel"),
  batchReviewActions: required<HTMLElement>("#batchReviewActions"),
  batchReviewCopy: required<HTMLElement>("#batchReviewCopy"),
  batchConfirmSheet: required<HTMLButtonElement>("#batchConfirmSheet"),
  batchSafeExport: required<HTMLButtonElement>("#batchSafeExport"),
  batchRetry: required<HTMLButtonElement>("#batchRetry"),
  batchApprove: required<HTMLButtonElement>("#batchApprove"),
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
  formulaDialogCopy: required<HTMLElement>("#formulaDialogCopy"),
  emailTypoDialog: required<HTMLDialogElement>("#emailTypoDialog"),
  emailTypoDialogCopy: required<HTMLElement>("#emailTypoDialogCopy")
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
  dismissedEmailTypos: Map<string, string>;
  processing: boolean;
  activeBatchId: string | null;
  batchItems: BatchItem[];
  stopBatch: boolean;
}

interface BatchItem {
  id: string;
  file: File;
  sourceFormat: OutputFormat;
  status: BatchStatus;
  statusMessage: string;
  headers: string[];
  rows: CellValue[][];
  rawRows: CellValue[][];
  sheetNames: string[];
  activeSheet: string | null;
  headerIndex: number;
  generatedHeaderCount: number;
  columnCandidates: ColumnCandidates;
  confirmedColumns: Record<"dedup" | "email" | "date", boolean>;
  settings: CleaningSettings;
  output: CleanedRow[];
  summary: CleaningSummary | null;
  reviewReasons: string[];
  approvedAsIs: boolean;
  sheetConfirmed: boolean;
  safeExport: boolean;
  manualEdits: Map<string, string>;
  dismissedEmailTypos: Map<string, string>;
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
  dismissedEmailTypos: new Map(),
  processing: false,
  activeBatchId: null,
  batchItems: [],
  stopBatch: false
};

const processor = new FileProcessor();
let presetStore: PresetStore = emptyPresetStore();
let activePresetSettings: PresetSettings = { ...DEFAULT_PRESET };

interface PendingEmailSuggestion {
  sourceIndex: number;
  columnIndex: number;
  originalEmail: string;
  correctedEmail: string;
}

let pendingEmailSuggestion: PendingEmailSuggestion | null = null;

function announce(message: string): void {
  els.announcer.textContent = "";
  window.setTimeout(() => { els.announcer.textContent = message; }, 25);
}

const themeController = createThemeController({
  toggle: els.themeToggle,
  label: els.themeToggleLabel
}, announce);

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) return "Demo data";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function currentPresetSettings(): PresetSettings {
  return {
    removeEmpty: els.removeEmpty.checked,
    trimWhitespace: els.trimWhitespace.checked,
    deduplicate: els.deduplicate.disabled ? activePresetSettings.deduplicate : els.deduplicate.checked,
    validateEmail: els.validateEmail.disabled ? activePresetSettings.validateEmail : els.validateEmail.checked,
    normalizeDates: els.normalizeDates.disabled ? activePresetSettings.normalizeDates : els.normalizeDates.checked,
    inputDateOrder: els.inputDateOrder.value as InputDateOrder,
    dateFormat: els.dateFormat.value as OutputDateFormat,
    batchOutputMode: els.batchOutputMode.value as BatchOutputMode
  };
}

function persistPresetStore(options: { quiet?: boolean } = {}): void {
  try {
    writePresetStore(window.localStorage, presetStore);
  } catch {
    if (!options.quiet) announce("Settings could not be stored in this browser. They still apply to this tab.");
  }
}

function rememberLastUsed(): void {
  activePresetSettings = currentPresetSettings();
  presetStore = { ...presetStore, lastUsed: { ...activePresetSettings } };
  persistPresetStore({ quiet: true });
}

function renderPresetOptions(selected = els.presetSelect.value || "last-used"): void {
  els.presetSelect.replaceChildren(
    new Option("Last used", "last-used"),
    ...presetStore.named.map((preset) => new Option(preset.name, preset.id))
  );
  els.presetSelect.value = presetStore.named.some((preset) => preset.id === selected) ? selected : "last-used";
  els.presetDelete.disabled = els.presetSelect.value === "last-used";
}

function applyPresetToControls(settings: PresetSettings): void {
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

function cleaningSettingsFor(
  preset: PresetSettings,
  candidates: ColumnCandidates,
  existing?: CleaningSettings
): CleaningSettings {
  const selectCandidate = (values: readonly string[], previous: string | undefined): string =>
    previous && values.includes(previous) ? previous : values[0] ?? "";
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

function optionList(select: HTMLSelectElement, headers: readonly string[], preferred: string): void {
  const previous = select.value;
  select.replaceChildren(...headers.map((header) => new Option(header, header)));
  const candidate = headers.includes(previous) ? previous : preferred;
  select.value = candidate || "";
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
  const candidates = detectColumnCandidates(
    state.headers,
    state.rows,
    els.inputDateOrder.value as InputDateOrder
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
  // Keep the hint's layout space so toggling the rule cannot shift adjacent controls.
  els.dateSettingsHelp.hidden = false;
  els.dateSettingsHelp.classList.toggle("is-concealed", enabled);
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
  if (result.diagnostics.possibleEmailTypos > 0) {
    const count = result.diagnostics.possibleEmailTypos;
    insights.push(createInsight(`${count} possible email ${count === 1 ? "domain typo" : "domain typos"} to review.`, {
      tone: "warning",
      actionLabel: settings.validateEmail ? undefined : "Enable email check",
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

function commitManualEdit(sourceIndex: number, columnIndex: number, nextValue: string): boolean {
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

function reviewEmailSuggestion(
  sourceIndex: number,
  columnIndex: number,
  originalEmail: string,
  correctedEmail: string
): void {
  if (state.processing) return;
  pendingEmailSuggestion = { sourceIndex, columnIndex, originalEmail, correctedEmail };
  els.emailTypoDialogCopy.textContent = `Keep ${originalEmail}, or use ${correctedEmail}. This is a suggestion, not a confirmed error.`;
  els.emailTypoDialog.returnValue = "";
  els.emailTypoDialog.showModal();
}

function finishEmailSuggestionReview(): void {
  const pending = pendingEmailSuggestion;
  pendingEmailSuggestion = null;
  if (!pending) return;
  if (els.emailTypoDialog.returnValue === "use") {
    if (commitManualEdit(pending.sourceIndex, pending.columnIndex, pending.correctedEmail)) {
      announce(`Email changed to ${pending.correctedEmail}.`);
      els.afterTable.closest<HTMLElement>(".table-scroll")?.focus();
    }
  } else if (els.emailTypoDialog.returnValue === "keep") {
    state.dismissedEmailTypos.set(
      emailCellKey(pending.sourceIndex, pending.columnIndex),
      pending.originalEmail.toLowerCase()
    );
    updateUI({ announceChange: true });
    announce(`Kept ${pending.originalEmail} for this file.`);
    els.afterTable.closest<HTMLElement>(".table-scroll")?.focus();
  }
}

function activeBatchItem(): BatchItem | null {
  return state.batchItems.find((item) => item.id === state.activeBatchId) ?? null;
}

function reviewReasonsFor(item: BatchItem, result: CleaningResult, preset: PresetSettings): string[] {
  const reasons: string[] = [];
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

function applyBatchEvaluation(
  item: BatchItem,
  result: CleaningResult,
  settings: CleaningSettings,
  preset: PresetSettings
): void {
  item.settings = settings;
  item.output = result.output;
  item.summary = result.summary;
  item.reviewReasons = reviewReasonsFor(item, result, preset);
  if (item.status === "cancelled" || item.status === "failed") return;
  item.status = item.approvedAsIs || item.reviewReasons.length === 0 ? "ready" : "needs-review";
  item.statusMessage = item.status === "ready"
    ? `${result.output.length} cleaned rows`
    : item.reviewReasons.join(" · ");
}

function evaluateBatchItem(item: BatchItem, preset = currentPresetSettings()): void {
  item.settings = cleaningSettingsFor(preset, item.columnCandidates, item.settings);
  const result = cleanRows(item.headers, item.rows, item.settings, item.manualEdits, item.dismissedEmailTypos);
  applyBatchEvaluation(item, result, item.settings, preset);
}

const STATUS_LABELS: Record<BatchStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  "needs-review": "Needs review",
  failed: "Failed",
  cancelled: "Cancelled"
};

function renderBatchPanel(): void {
  const inBatch = state.batchItems.length > 1;
  els.batchPanel.hidden = !inBatch;
  if (!inBatch) return;
  const ready = state.batchItems.filter((item) => item.status === "ready").length;
  const review = state.batchItems.filter((item) => item.status === "needs-review").length;
  const failed = state.batchItems.filter((item) => item.status === "failed").length;
  els.batchSummary.textContent = `${state.batchItems.length} files · ${ready} ready · ${review} need review${failed ? ` · ${failed} failed` : ""}`;
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
  els.batchReviewCopy.textContent = active.status === "failed"
    ? active.statusMessage
    : `Review ${active.file.name}: ${active.reviewReasons.join(" · ")}.`;
  els.batchConfirmSheet.hidden = !(active.sheetNames.length > 1 && !active.sheetConfirmed);
  const formulaReason = active.reviewReasons.some((reason) => reason.includes("formula-like"));
  els.batchSafeExport.hidden = !formulaReason;
  els.batchRetry.hidden = active.status !== "failed";
  els.batchApprove.hidden = active.status === "failed";
}

function hydrateFromBatchItem(item: BatchItem): void {
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
  els.outputFormat.value = batchOutputFormat(els.batchOutputMode.value as BatchOutputMode, item.file.name);
  els.outputFormat.disabled = true;
  setFilePresentation();
  updateUI();
  renderBatchPanel();
}

function selectBatchItem(id: string): void {
  const item = state.batchItems.find((candidate) => candidate.id === id);
  if (!item || item.status === "queued" || item.status === "processing") return;
  hydrateFromBatchItem(item);
  announce(`${item.file.name} selected. ${STATUS_LABELS[item.status]}.`);
}

function removeBatchItem(id: string): void {
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

function updateUI(options: { announceChange?: boolean } = {}): void {
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
    activeItem.confirmedColumns.dedup = candidates.dedup.length <= 1
      ? true
      : activeItem.confirmedColumns.dedup && candidates.dedup.includes(settings.dedupColumn);
    activeItem.confirmedColumns.email = candidates.email.length <= 1
      ? true
      : activeItem.confirmedColumns.email && candidates.email.includes(settings.emailColumn);
    activeItem.confirmedColumns.date = candidates.date.length <= 1
      ? true
      : activeItem.confirmedColumns.date && candidates.date.includes(settings.dateColumn);
    activeItem.columnCandidates = candidates;
    if (options.announceChange) activeItem.approvedAsIs = false;
    applyBatchEvaluation(activeItem, result, settings, currentPresetSettings());
  }
  const tableOptions = {
    headers: state.headers,
    originalIssues: (row: readonly CellValue[], sourceIndex: number) => issuesForOriginalRow(
      row, state.headers, settings, sourceIndex, state.dismissedEmailTypos
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
  const extension = (els.outputFormat.value as OutputFormat).toUpperCase();
  if (state.batchItems.length > 1) {
    const readyCount = state.batchItems.filter((item) => item.status === "ready").length;
    els.downloadButtonLabel.textContent = "Download ready files";
    els.downloadMeta.textContent = `ZIP · ${readyCount} of ${state.batchItems.length} files ready`;
  } else {
    els.downloadButtonLabel.textContent = "Download cleaned file";
    els.downloadMeta.textContent = `${extension} · ${result.output.length} rows · ${state.isDemo ? "demo data" : "ready to download"}`;
  }
  renderInsights(result, settings);
  if (activeItem) renderBatchPanel();
  if (options.announceChange) {
    announce(`${result.output.length} cleaned rows ready. ${valuesToReview} values need review.`);
  }
}

function setFilePresentation(): void {
  els.fileName.textContent = state.filename;
  els.fileMeta.textContent = `${fileSizeLabel(state.fileSize)} · ${state.rows.length} rows`;
  els.changeFile.textContent = "Choose files";
}

function setProcessing(processing: boolean, message = "Processing file…"): void {
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
  [els.removeEmpty, els.trimWhitespace, els.deduplicate, els.validateEmail, els.normalizeDates,
    els.dedupColumn, els.emailColumn, els.dateColumn].forEach((control) => { control.disabled = processing; });
  if (!processing) configureColumns();
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
  state.dismissedEmailTypos.clear();
  applyPresetToControls(currentPresetSettings());
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

function createBatchItem(file: File, index: number): BatchItem {
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
    manualEdits: new Map(),
    dismissedEmailTypos: new Map()
  };
}

async function processBatchItem(item: BatchItem): Promise<void> {
  item.status = "processing";
  item.statusMessage = "Reading and checking file…";
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

function hasMeaningfulCells(rows: readonly (readonly CellValue[])[]): boolean {
  return rows.some((row) => row.some((cell) => cellToString(cell).trim() !== ""));
}

function retainedBatchCells(excludedId: string | null = null): number {
  return state.batchItems.reduce((total, item) => (
    item.id === excludedId || item.status === "failed" || item.status === "cancelled"
      ? total
      : total + item.rows.length * item.headers.length
  ), 0);
}

function enforceBatchCellLimit(item: BatchItem, retainedCells: number): boolean {
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

async function processBatchFiles(files: readonly File[]): Promise<void> {
  const perFileLimit = processor.supportsBackgroundProcessing ? HOSTED_FILE_LIMIT_BYTES : LOCAL_FILE_LIMIT_BYTES;
  validateBatchSelection(files, perFileLimit);
  const items = files.map(createBatchItem);
  state.batchItems = items;
  state.activeBatchId = null;
  state.stopBatch = false;
  clearFileError();
  setProcessing(true, `Processing 1 of ${items.length} files…`);
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
    setProcessing(true, `Processing ${index + 1} of ${items.length} files…`);
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

async function retryBatchItem(item: BatchItem): Promise<void> {
  if (state.processing) return;
  item.approvedAsIs = false;
  item.safeExport = false;
  setProcessing(true, `Retrying ${item.file.name}…`);
  await processBatchItem(item);
  if (item.status !== "failed") enforceBatchCellLimit(item, retainedBatchCells(item.id));
  setProcessing(false);
  hydrateFromBatchItem(item);
}

async function onWorksheetChange(): Promise<void> {
  const sheetName = els.worksheet.value;
  if (!sheetName || sheetName === "csv") return;
  setProcessing(true, `Loading ${sheetName}…`);
  try {
    const activeItem = activeBatchItem();
    if (activeItem) {
      await processor.load(activeItem.sourceFormat, await activeItem.file.arrayBuffer());
    }
    const rows = await processor.selectSheet(sheetName) as CellValue[][];
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

function cleanedArchiveFilename(item: BatchItem, extension: OutputFormat): string {
  const base = item.file.name.replace(/\.(csv|xlsx)$/i, "").replace(/[\\/:*?"<>|]/g, "-").trim() || "cleaned-data";
  return `${base}_cleaned.${extension}`;
}

function batchReportEntries(includedIds: ReadonlySet<string>): BatchReportEntry[] {
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

async function downloadBatch(): Promise<void> {
  const readyItems = state.batchItems.filter((item) => item.status === "ready");
  if (!readyItems.length) {
    showFileError("No files are ready yet. Review or retry the files in the batch first.");
    return;
  }
  const originalLabel = els.downloadButtonLabel.textContent ?? "Download ready files";
  els.downloadButton.disabled = true;
  els.downloadButton.setAttribute("aria-busy", "true");
  els.downloadButtonLabel.textContent = "Preparing ZIP…";
  try {
    const usedNames = new Set<string>();
    const archiveFiles: { name: string; data: ArrayBuffer | string }[] = [];
    for (let index = 0; index < readyItems.length; index += 1) {
      const item = readyItems[index];
      if (!item) continue;
      els.downloadButtonLabel.textContent = `Exporting ${index + 1} of ${readyItems.length}…`;
      const format = batchOutputFormat(els.batchOutputMode.value as BatchOutputMode, item.file.name);
      const rawRows: CellValue[][] = [item.headers, ...item.output.map((entry) => entry.values)];
      const rows = item.safeExport ? safeRows(rawRows) : rawRows.map((row) => row.map(cellToString));
      const exported = await processor.exportRows(format, rows, item.safeExport && format === "csv");
      archiveFiles.push({
        name: uniqueArchiveName(cleanedArchiveFilename(item, exported.extension), usedNames),
        data: exported.buffer
      });
    }
    const includedIds = new Set(readyItems.map((item) => item.id));
    archiveFiles.push({ name: "cleanup_report.csv", data: `\uFEFF${cleanupReportCsv(batchReportEntries(includedIds))}` });
    els.downloadButtonLabel.textContent = "Creating ZIP…";
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

function requestDownload(): void {
  if (state.batchItems.length > 1) {
    void downloadBatch();
    return;
  }
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

function handleFiles(files: readonly File[]): void {
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

function reapplyPresetToBatch(): void {
  const preset = currentPresetSettings();
  state.batchItems.forEach((item) => {
    if (item.status === "failed" || item.status === "cancelled" || item.status === "processing" || item.status === "queued") return;
    item.approvedAsIs = false;
    const candidates = detectColumnCandidates(item.headers, item.rows, preset.inputDateOrder);
    item.confirmedColumns = {
      dedup: candidates.dedup.length <= 1 || (item.confirmedColumns.dedup && candidates.dedup.includes(item.settings.dedupColumn)),
      email: candidates.email.length <= 1 || (item.confirmedColumns.email && candidates.email.includes(item.settings.emailColumn)),
      date: candidates.date.length <= 1 || (item.confirmedColumns.date && candidates.date.includes(item.settings.dateColumn))
    };
    item.columnCandidates = candidates;
    evaluateBatchItem(item, preset);
  });
}

function handlePreferenceChange(): void {
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

function loadSelectedPreset(): void {
  const selected = els.presetSelect.value;
  const settings = selected === "last-used"
    ? presetStore.lastUsed
    : presetStore.named.find((preset) => preset.id === selected)?.settings;
  if (!settings) return;
  applyPresetToControls(settings);
  rememberLastUsed();
  reapplyPresetToBatch();
  updateUI({ announceChange: true });
  renderPresetOptions(selected);
  renderBatchPanel();
  announce(`${selected === "last-used" ? "Last used settings" : "Preset"} applied.`);
}

function showPresetForm(): void {
  els.presetForm.hidden = false;
  els.presetName.value = "";
  els.presetName.focus();
}

function hidePresetForm(): void {
  els.presetForm.hidden = true;
  els.presetName.value = "";
  els.presetSave.focus();
}

function saveNamedPreset(): void {
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

function deleteSelectedPreset(): void {
  const id = els.presetSelect.value;
  const preset = presetStore.named.find((entry) => entry.id === id);
  if (!preset) return;
  presetStore = deleteNamedPreset(presetStore, id);
  persistPresetStore();
  renderPresetOptions("last-used");
  announce(`${preset.name} deleted.`);
}

function resetSettings(): void {
  applyPresetToControls(DEFAULT_PRESET);
  rememberLastUsed();
  reapplyPresetToBatch();
  updateUI({ announceChange: true });
  renderPresetOptions("last-used");
  renderBatchPanel();
  announce("Default cleaning settings restored.");
}

function bindEvents(): void {
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
  els.worksheet.addEventListener("change", () => { void onWorksheetChange(); });
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
  els.batchOutputMode.addEventListener("change", handlePreferenceChange);
  ([
    [els.dedupColumn, "dedup"],
    [els.emailColumn, "email"],
    [els.dateColumn, "date"]
  ] as const).forEach(([control, type]) => control.addEventListener("change", () => {
    const active = activeBatchItem();
    if (active) {
      active.approvedAsIs = false;
      active.confirmedColumns[type] = true;
    }
    updateUI({ announceChange: true });
  }));
  const columnPickers: Array<[HTMLElement, HTMLButtonElement]> = [
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

function initialize(): void {
  els.fileLimit.textContent = processor.supportsBackgroundProcessing
    ? `Files up to 50 MB are processed in the background. Batch: up to ${MAX_BATCH_FILES} files and 100 MB total.`
    : "Direct-open mode supports files up to 10 MB. Use the GitHub Pages version for files up to 50 MB.";
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
