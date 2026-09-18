# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML and CSS with strict TypeScript source bundled into browser-ready JavaScript with esbuild. Development uses pnpm; the committed browser bundles deploy directly to static hosting and require no client installation.

## Users

Freelancers and small-business clients who need to clean a CSV or Excel table without sending its contents to a third-party processing service.

## Product Purpose

CSV/Excel Data Cleaner lets a person preview a spreadsheet, choose transparent cleaning rules, review the result, and download a cleaned copy. Its first success case is a credible, real demo for a freelance portfolio and small client projects.

## Positioning

The tool processes the selected spreadsheet locally in the visitor's browser. It does not upload, retain, or transmit the spreadsheet data to an application backend.

## Operating Context

The visitor chooses one or several `.csv` or `.xlsx` files. GitHub Pages mode accepts up to 50 MB per file and performs parsing in a background worker; direct-open backup mode accepts up to 10 MB per file. For a workbook, the visitor chooses a worksheet. The app uses the first non-empty row as the safe header default and offers the first 20 non-empty rows as alternatives. It finds plausible email, date, and duplicate-key columns. The visitor sees a preview, opts into cleaning actions, corrects values when necessary, and downloads CSV or XLSX output. A multi-file selection becomes a sequential review queue and downloads ready results together as a ZIP.

## Capabilities and Constraints

- Accept CSV and XLSX files up to 50 MB on static hosting and up to 10 MB when opened directly; explain that processing speed depends on file size and device.
- Parse and export hosted files in a background worker, with a timeout that recovers from stalled work.
- Stop a hosted operation when its worker fails or times out; never retry heavy parsing or export on the interface thread.
- Reject tables above 200,000 rows, 256 columns, or 2,000,000 cells, cells above 100,000 characters, and workbooks above 50 worksheets.
- Accept UTF-8 comma-, semicolon-, and tab-delimited text. Reject malformed UTF-8 instead of silently replacing characters.
- Offer worksheet selection for XLSX files.
- Remember the last settings locally and support up to five named settings-only presets. Never store spreadsheet rows in a preset.
- Accept batches of 2–10 files up to 100 MB total, process them sequentially, and retain no more than 2,000,000 cells across the queue.
- Auto-select the first non-empty worksheet in batch workbooks and require confirmation when a workbook contains more than one sheet.
- Mark ambiguous or unsafe files as **Needs review**. Exclude them from the ZIP until the visitor resolves the issue or explicitly approves the remaining values.
- Let batch users preserve each source format or convert every ready file to CSV or XLSX, then include a `cleanup_report.csv` beside the results in one local ZIP.
- Offer opt-in removal of blank rows, whitespace trimming, and duplicate removal by a suggested relevant column. Duplicate removal is off by default.
- Show compact in-product notices when duplicates or invalid values are found, with an action to enable the applicable rule.
- Flag unambiguous, close email-domain typos for common international providers separately from invalid syntax; let the visitor use the suggestion or keep the original address without automatic correction or mailbox-verification claims.
- Let the user choose from relevant email and date columns, edit any cleaned cell before export, and normalize dates to DD-MM-YY, MM-DD-YY, or YY-MM-DD. The output date format is separate from the chosen order for ambiguous numeric input dates; ISO and text dates are recognized independently. Invalid values remain flagged rather than silently deleted.
- Preserve wider data rows by generating `Column N` headers instead of silently dropping cells.
- Export the cleaned selected sheet as CSV or XLSX.
- Before export, detect values that spreadsheet programs could interpret as formulas. Let the user choose a safe plain-text version or an original-values version.
- Interface copy is English only.
- Version 1 treats an Excel worksheet as table data; it does not promise to preserve workbook formatting, formulas, or unselected sheets. Legacy `.xls` is not supported.
- No accounts, cloud storage, backend, or database in version 1.

## Evidence on Hand

No client work, testimonials, ratings, or production dataset may be claimed. Demo data must be visibly labelled as synthetic.

## Product Principles

- The user stays in control of every data-changing rule.
- Privacy is explained plainly and implemented by local browser processing.
- A useful first version beats a broad, fragile feature list.
- Output must be easy to inspect before downloading.
- Manual edits stay in the visitor's browser and are included in the downloaded file.
- Automation may suggest and organize; it must not silently decide how to handle ambiguous columns, worksheets, or unsafe values.

## Accessibility & Inclusion

Use semantic controls, visible keyboard focus, readable contrast, status messages, and responsive layouts for desktop and mobile browsers.
