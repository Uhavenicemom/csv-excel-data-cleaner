# CSV / Excel Data Cleaner

A browser-based tool that cleans spreadsheet data locally before export.

The app works with CSV and Excel (`.xlsx`) files. It lets you preview a sheet, choose cleaning rules, correct values directly in the cleaned preview, and download the result as CSV or Excel.

## What it can do

- Remove fully empty rows
- Trim unwanted whitespace
- Identify likely email, date, and duplicate-key columns from the data, then only offer relevant choices
- Keep duplicate removal off until the user explicitly enables it
- Show compact, actionable notices for duplicate values and values that need review
- Validate an email column
- Suggest conservative corrections for close misspellings of common international email-provider domains, with explicit **Use suggestion** or **Keep original** choices
- Normalize dates to `DD-MM-YY`, `MM-DD-YY`, or `YY-MM-DD`, with a separate input-order choice for ambiguous numeric dates
- Flag invalid email addresses and dates for review
- Edit any cleaned cell before downloading
- Browse every row through a responsive, virtualized table
- Use the first non-empty row as the safe header default and let the user choose another row
- Preserve cells beyond the selected header width by creating clearly labelled `Column N` headers
- Choose a worksheet from an Excel workbook
- Export the selected cleaned sheet as `.csv` or `.xlsx`
- Warn before exporting cells that could be interpreted as spreadsheet formulas, then let the user choose a quoted safe-text export or the original values
- Process hosted files in a background worker and stop stalled work after 30 seconds
- Remember the last cleaning setup in the browser and save up to five named presets; presets contain settings only, never spreadsheet values
- Process 2–10 CSV/XLSX files as a sequential batch, review each file independently, and exclude unresolved files from export
- Keep each batch file's original format or convert all ready files to CSV or XLSX
- Download ready batch results as one ZIP with a client-readable `cleanup_report.csv`

## Privacy

Files are processed locally in the browser. The app does not send spreadsheet contents to an application server and does not store them in a database.

## Use it

Open the [public GitHub Pages demo](https://uhavenicemom.github.io/csv-excel-data-cleaner/). Clients do not need to install or compile anything.

For a portable backup, download the repository and open `index.html` directly. Direct-open mode supports files up to 10 MB each; the hosted version supports files up to 50 MB each and keeps heavy parsing away from the interface thread.

## Develop it

The editable source is TypeScript in `src/`. Install Node.js 24 or newer and pnpm 11, then run:

```text
pnpm install
pnpm check
```

`pnpm check` runs the strict TypeScript check, verifies both browser bundles, runs the automated behavior tests, rebuilds `app.js` and `xlsx-worker.js`, and audits the static release files. Those generated files are committed so end users never need the TypeScript toolchain.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module boundaries, processing flow, limits, and release checklist.

## Demo data

`customers_dirty.csv` contains synthetic, intentionally inconsistent customer data for testing the cleaner. It is not client data. It demonstrates whitespace cleanup, blank rows, duplicate emails, invalid email syntax, possible email-domain typos, mixed date formats, invalid dates, and a formula-like export warning.

## Limits of this version

Hosted files are limited to 50 MB each and direct-open files to 10 MB each. A batch accepts at most 10 files and 100 MB total, processes them sequentially, and retains at most 2,000,000 cells across the batch. A single table may contain at most 200,000 rows, 256 columns, 2,000,000 cells, 100,000 characters in one cell, and an Excel workbook may contain at most 50 worksheets. Actual speed depends on the device and the files' structure.

If background processing fails or takes more than 30 seconds on the hosted app, the operation stops with an actionable message. It does not retry heavy parsing on the interface thread.

CSV input must be UTF-8 and may use comma, semicolon, or tab delimiters. Two-digit years are treated as 2000–2099; use four-digit years for older dates.

Email-domain suggestions use a small offline list of international providers and only appear for an unambiguous one-edit typo in the provider name. They do not verify that a mailbox exists, recognize every provider or national domain, or automatically change an address. **Keep original** dismisses that suggestion for the current file only.

For a batch workbook, the app starts with the first non-empty worksheet and asks for confirmation when more than one worksheet exists. Excel files are treated as table data. The export does not aim to preserve workbook formulas, styling, charts, or worksheets that were not selected. Legacy `.xls` files are not supported.

Batch ZIP creation uses the vendored JSZip library so results are still assembled locally. Files that need review are not included until the visitor fixes the issue, chooses a safe export, confirms the worksheet, or explicitly approves the remaining values.
