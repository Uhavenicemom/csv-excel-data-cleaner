# Vendored browser libraries

`xlsx.full.min.js` is SheetJS Community Edition 0.20.3, used for local `.xlsx` import and export.

- Upstream distribution: <https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js>
- Local SHA-256: `B315047C382F0F4033305AD72F2204747DAEF391784EE6138289EFC0831B63D0`
- License: Apache-2.0; the upstream copyright header is preserved in the file.

The file is stored in the repository so spreadsheet contents can stay in the browser and the app does not depend on a runtime CDN.

## JSZip

`jszip.min.js` is JSZip 3.10.1, loaded only when a batch ZIP is created.

- Upstream package: <https://www.npmjs.com/package/jszip/v/3.10.1>
- Local SHA-256: `ACC7E41455A80765B5FD9C7EE1B8078A6D160BBBCA455AEAE854DE65C947D59E`
- License: MIT; the complete license is stored in `JSZIP-LICENSE.md`.

Keeping the reviewed distribution locally preserves the app's no-upload, no-runtime-CDN privacy boundary.
