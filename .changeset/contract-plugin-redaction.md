---
'@embedpdf/plugin-redaction': minor
'@embedpdf/plugin-annotation': minor
---

The redaction plugin now follows the 3.0 public contract.

- Pending marks are page-space `RedactionMark`s: `listPending(filter?)`, `getPending(ref)`, `getPendingCount(page?)`; `estimateCollateral(refs?)` returns `{ count, refs }`; `getLastResult` replaces `lastResult`.
- Marking verbs: `markSelection` (was `queueCurrentSelection`, returns the refs), `markArea`, `markPage`, `markMatches` (needs the search plugin), `unmark`, `clearPending`, `updateLabel` (was `setLabel`).
- `apply` takes refs; `applyPages` is new; `applyAll` unchanged. `onApplied` is an event hook carrying `{ result, origin }`; `onPendingChanged { pages }` is new.
- Removed: `enableRedact`, `toggleRedact`, `isRedactActive` (use `interaction.activateTool('redact')`), `preparePending`, `pendingCount`.
- `redactionPlugin(config)` accepts `overlay` defaults for the marks it creates. The package gains `./contract/host` and `./internal` entries and depends on `@embedpdf/plugin-search` (optional at runtime).
- Annotation: `create()` accepts an area redaction (`{ subtype: 'redact', bounds }`).
