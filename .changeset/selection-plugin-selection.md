---
'@embedpdf/plugin-selection': minor
---

Selection has live settings: `dragThreshold`, `color` and `handles` (`color`, `shadow`), with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `selectionPlugin(config)` registers them over `SELECTION_DEFAULTS` (`SelectionConfig` is `DeepPartial<SelectionSettings>`); they exist before any document opens, and a change reaches every document at once: a new `dragThreshold` applies to the next press. A `color` of `null`, the default, follows the viewer's accent (at 35% for the selected text).

`selectionState` declares the selection's state for every framework: `hasSelection`, `isSelecting`, `range` and `pages`. `isSelecting()` is public and replaces the host lens's `isGestureActive()`.

A page argument (`selectPage`, `selectWordAt`, `selectLineAt`, `extendTo`, `listSegments`, `listRects`) is a `PageRef` or an index: the verbs throw `not-found` for a page that isn't in the document, and the reads answer empty. `readText()` refuses without `doc.text.copy` whether or not anything is selected, and `readTextInRange()` refuses under its own name. A `signal` stops either read at once with `operation-cancelled`; the page text it started reading is still kept for the next read.
