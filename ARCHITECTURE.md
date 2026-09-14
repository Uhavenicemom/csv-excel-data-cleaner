# Architecture

## Goal

CSV / Excel Data Cleaner is a static portfolio demo that a prospective client can open and use immediately. Spreadsheet contents stay in the browser. There is no application server, account system, database, telemetry, or upload endpoint.

## Runtime flow

1. `index.html` provides the semantic application shell, `theme-boot.js` applies the saved theme before first paint, and `styles.css` provides responsive light and dark themes.
2. `src/main.ts` coordinates controls, application state, notices, and downloads.
3. On GitHub Pages, `src/file-processor.ts` transfers parsing and export work to `src/xlsx-worker.ts`. A worker failure or 30-second timeout stops the operation instead of retrying it on the interface thread.
4. When `index.html` is opened directly, browser worker restrictions require the smaller 10 MB direct-processing path.
5. SheetJS is loaded only when an Excel file is parsed or an Excel file is exported. CSV-only sessions do not load the Excel library.
6. Parsed rows pass through the pure functions in `src/cleaning.ts`, `src/dates.ts`, `src/sheets.ts`, and `src/security.ts`.
7. `src/table-view.ts` virtualizes large previews while keeping the scroll regions keyboard focusable. Manual edits are written back to the controller state before export.

## Module responsibilities

- `src/csv.ts`: strict UTF-8 decoding, delimiter detection, CSV parsing, and CSV serialization.
- `src/xlsx.ts`: guarded workbook reading, worksheet extraction, and workbook export.
- `src/limits.ts`: shared structural limits enforced at parsing, editing, and export boundaries.
- `src/file-processor.ts`: hosted worker lifecycle, direct-open compatibility, lazy Excel support, timeouts, and error propagation.
- `src/xlsx-worker.ts`: isolated parse, worksheet, and export request handling.
- `src/cleaning.ts`: deterministic cleaning rules, diagnostics, and summaries.
- `src/table-view.ts`: accessible virtualized tables and cleaned-cell editing.
- `src/theme.ts`: saved light/dark preference and system-theme fallback.
- `src/main.ts`: page wiring and user-facing state only.

## Data and security boundaries

The selected file is untrusted input. The app validates the filename extension and file signature where applicable, enforces byte and table-shape limits, creates interface content with `textContent`, and never evaluates spreadsheet values as HTML or code. A restrictive static Content Security Policy permits only same-origin scripts and stylesheet files and disables network connections, plugins, base-tag rewriting, and form submission. Inline style attributes are allowed only because virtualized spacer rows need a numeric height; inline scripts and inline stylesheet elements remain disallowed.

Hosted and direct-open byte limits are 50 MB and 10 MB respectively. All modes also enforce 200,000 rows, 256 columns, 2,000,000 cells, 100,000 characters per cell, and 50 worksheets. These are safety limits, not performance guarantees; available browser memory and data shape still affect speed.

Before export, formula-like values are counted. The user can download a safe text version or deliberately keep original values. The safe CSV path quotes all fields and prefixes dangerous formulas so spreadsheet software treats them as text.

## Build and verification

Install Node.js 24 or newer and pnpm 11, then run:

```text
pnpm install
pnpm check
```

The check performs strict TypeScript analysis, validates both browser bundles, runs deterministic tests, regenerates the committed bundles, and audits the final static assets. GitHub Actions runs the same command on pushes and pull requests using read-only repository permissions and commit-pinned third-party actions.

## Release and rollback

1. Run `pnpm check` locally.
2. Preview through a local HTTP server and verify desktop and mobile layouts, keyboard scrolling, dark mode, CSV parsing, Excel parsing, manual editing, warnings, and both export formats.
3. Review the complete change set and confirm that no real client data, credentials, or temporary files are included.
4. Publish the reviewed static files to the default branch. GitHub Pages must use **GitHub Actions** as its source; `.github/workflows/pages.yml` packages and deploys the static site with Node.js 24-compatible actions.
5. Wait for both the Quality and Deploy GitHub Pages workflows to finish, then reopen the public URL and repeat the worker harness smoke test.

To roll back, restore the last reviewed versions of the static files and source modules together. Do not roll back only `app.js` or `xlsx-worker.js`, because the committed bundles and TypeScript source must describe the same release.
