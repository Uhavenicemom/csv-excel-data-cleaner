# Interface design

## Direction

The cleaner should feel like a dependable desktop utility in a browser: compact, quiet, legible, and explicit about what will change. The interface uses a restrained blue accent, neutral surfaces, small radii, and dense but readable controls rather than decorative dashboard cards.

## Hierarchy

1. Privacy and file intake establish trust and the current source.
2. File, header, date, and preset controls define the processing contract.
3. A batch queue appears only for multi-file work and keeps each file's state visible.
4. Cleaning rules and actionable checks explain what the app can change.
5. Before/after tables provide evidence.
6. Results and download complete the workflow.

Single-file use keeps the original compact path. Batch-only controls stay absent until they are useful.

## Interaction rules

- Dynamic helper text reserves its layout space or uses visibility, so showing guidance never shifts neighbouring controls.
- Automatic detection may choose a clear single candidate. Multiple plausible columns, multiple worksheets, invalid values, and formula-like cells require review or explicit approval.
- Status text must describe real state. Every visible button must perform a necessary action, and duplicate status copy should be avoided.
- Source data is never overwritten. Manual edits, accepted suggestions, and approvals affect only the in-memory output.
- Presets store settings only and say so next to the control.
- Batch processing is sequential, cancellable between files, and honest about partial success.

## Responsive behaviour

Desktop uses a wide utility layout with paired previews. Narrow layouts stack controls, queue actions, previews, and results into one readable column. Touch targets reach at least 44 pixels where space permits, tables retain independent keyboard-accessible scrolling, and long filenames truncate without widening the page.

## Themes and accessibility

Light and dark themes share semantic color roles rather than independent styling. Contrast, visible focus, native controls, live processing announcements, text status labels, and reduced-motion behaviour are required. Color supports a status but never carries its meaning alone.
