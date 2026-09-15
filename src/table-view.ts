import type { CellValue, CleanedRow, RowIssues } from "./types.ts";
import { EMAIL_TYPO_ISSUE, suggestEmailDomain } from "./email-domains.ts";
import { cellToString } from "./value.ts";

const VIRTUAL_ROW_BUFFER = 12;

type TableEntry = readonly CellValue[] | CleanedRow;

interface VirtualController {
  frame: number;
  handleScroll: () => void;
  observer: ResizeObserver | null;
}

export interface TableViewOptions {
  headers: readonly string[];
  rows: readonly TableEntry[];
  kind: "before" | "after";
  originalIssues: (row: readonly CellValue[], sourceIndex: number) => RowIssues;
  onEdit: (sourceIndex: number, columnIndex: number, nextValue: string) => boolean;
  onEmailSuggestion: (sourceIndex: number, columnIndex: number, originalEmail: string, correctedEmail: string) => void;
}

const virtualTables = new WeakMap<HTMLTableElement, VirtualController>();

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

function makeEditableCell(
  value: string,
  entry: CleanedRow,
  columnIndex: number,
  options: TableViewOptions
): HTMLElement {
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

function createTableHeader(headers: readonly string[]): HTMLTableSectionElement {
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

function isCleanedRow(entry: TableEntry): entry is CleanedRow {
  return !Array.isArray(entry);
}

function createDataRow(
  entry: TableEntry,
  visibleIndex: number,
  options: TableViewOptions
): HTMLTableRowElement {
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
      cell.textContent = display || "—";
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

function tableRowHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--table-row-height");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 34;
}

function createSpacerRow(height: number, columnCount: number): HTMLTableRowElement {
  const spacer = document.createElement("tr");
  spacer.className = "virtual-spacer";
  const cell = document.createElement("td");
  cell.colSpan = columnCount + 1;
  cell.style.height = `${height}px`;
  spacer.append(cell);
  return spacer;
}

export function renderTable(table: HTMLTableElement, options: TableViewOptions): void {
  const scroll = table.closest<HTMLElement>(".table-scroll");
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
  const controller: VirtualController = { frame: 0, handleScroll: () => undefined, observer: null };

  const renderVisibleRows = (): void => {
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
