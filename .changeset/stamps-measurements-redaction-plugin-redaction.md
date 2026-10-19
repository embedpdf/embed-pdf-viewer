---
'@embedpdf/plugin-redaction': minor
---

The `overlay` settings apply to every mark: the redact tool's, the selected text's and the ones made from code. They become the redact tool's defaults, and they are live: read through `getSettings()`, changed with `updateSettings()` and `resetSettings()` for every document, and announced by `onSettingsChanged` (`REDACTION_DEFAULTS`: a black fill, a white Helvetica label that fits the area).

Marking verbs resolve the marks they made: `markSelection()` and `markMatches()` resolve `{ marks }`, `markArea()` and `markPage()` `{ mark }`, and `updateLabel()` `{ mark }`. A mark has `repeat`. `canUnmark(ref)` and `canUpdateLabel(ref)` are new and answer per mark; `unmark()` and `clearPending()` report a mark this session may not delete as failed with `permission-denied`, and `updateLabel()` refuses one it may not change. Page arguments are a ref or an index, and every async verb takes a `signal`. `redactionState` declares the state (`pendingCount`, `applying`, `lastResult`).
