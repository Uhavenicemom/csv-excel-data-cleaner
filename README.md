# CSV / Excel Data Cleaner

A private, browser-based tool for cleaning spreadsheet data before export.

The app works with CSV and Excel (`.xlsx`) files. It lets you preview a sheet, choose cleaning rules, correct values directly in the cleaned preview, and download the result as CSV or Excel.

## What it can do

- Remove fully empty rows
- Trim unwanted whitespace
- Remove duplicates using a selected column
- Validate an email column
- Normalize dates to `DD-MM-YY`, `MM-DD-YY`, or `YY-MM-DD`
- Flag invalid email addresses and dates for review
- Edit any cleaned cell before downloading
- Choose a worksheet from an Excel workbook
- Export the selected cleaned sheet as `.csv` or `.xlsx`

## Privacy

Files are processed locally in the browser. The app does not send spreadsheet contents to an application server and does not store them in a database.

## Run locally

No build step is required. Open `index.html` in a browser, or serve this folder with a simple local web server.

## Demo data

`test-dirty-data.csv` contains synthetic, intentionally inconsistent data for testing the cleaner. It is not client data.

## Limits of this version

Excel files are treated as table data. The export does not aim to preserve workbook formulas, styling, charts, or worksheets that were not selected.
