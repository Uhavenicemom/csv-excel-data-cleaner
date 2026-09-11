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
- Normalize dates to `DD-MM-YY`, `MM-DD-YY`, or `YY-MM-DD`, with a separate input-order choice for ambiguous numeric dates
- Flag invalid email addresses and dates for review
- Edit any cleaned cell before downloading
- Browse every row through a responsive, virtualized table
- Detect the likely header row within the first 20 rows and let the user change it
- Choose a worksheet from an Excel workbook
- Export the selected cleaned sheet as `.csv` or `.xlsx`
- Warn before exporting cells that could be interpreted as spreadsheet formulas, then let the user choose a safe text export or the original values

## Privacy

Files are processed locally in the browser. The app does not send spreadsheet contents to an application server and does not store them in a database.

## Run locally

No build step is required. Open `index.html` in a browser, or serve this folder with a simple local web server.

## Demo data

`customers_dirty.csv` contains synthetic, intentionally inconsistent customer data for testing the cleaner. It is not client data. It demonstrates whitespace cleanup, blank rows, duplicate emails, invalid emails, mixed date formats, invalid dates, and a formula-like export warning.

## Limits of this version

Files are limited to 50 MB so the browser stays responsive; actual speed depends on the device and the file's structure.

Excel files are treated as table data. The export does not aim to preserve workbook formulas, styling, charts, or worksheets that were not selected. Legacy `.xls` files are not supported.

