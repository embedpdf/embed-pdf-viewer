---
'@embedpdf/plugin-annotation': minor
---

Every annotation action is one change:

- Moving, restyling, deleting, grouping or ungrouping a selection is one change and one request, however many annotations it touches. A replace-text pair, and a link with its children, are one change too. The engine applies a change all or nothing, and answers changes in the order they were made, so what shows never falls back to an older edit.
- A new annotation has its final ref from the moment it shows: it can be selected, edited, linked or deleted at once.
- Typing into a free text is one change per pause, sent after the pause, when editing ends, when anything else changes, and before a download.
- A stamp shows its drawing the moment it's placed, and keeps its proportions when it's resized.
- `renderAppearances` resolves `AnnotationAppearancePicture`s: the engine's pictures, and the preview of a stamp placed a moment ago.
