---
'@embedpdf/plugin-actions': minor
---

The actions plugin has live settings: `policy`, `triggers`, `openSequence` and `javascript` (`enabled`, `identity`), with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `actionsPlugin(config)` registers them over `ACTIONS_DEFAULTS`; the script environment (`sandboxFactory`, `now`, `budget`, …) stays registration-only beside `javascript`'s settings. A policy or trigger change applies to the next action, a new `javascript.identity` to the next script, and `javascript.enabled` to the documents opened after it. `getPolicy()` and `updatePolicy()` are gone.

The events are `onExecuted { tree, result, source }`, `onDiagnosticReported { code, action, source }`, `onScriptDiagnosticReported { code, message }` and `onScriptFailed { error, source }` (were `onDiagnostic`, `onScriptDiagnostic` and `onScriptError`). A `'block'` rule stops an action quietly; `'report'` reports it.

`canExecuteNamed(name, context?)` answers whether `executeNamed()` would run a viewer action; `'Print'` also needs `doc.print`. `execute`, `executeNamed`, `dispatch`, `getActionTree`, `runDocumentVerb` and `prepareClose` take a `signal`: `execute` rejects `operation-cancelled`, and a tree that is running stops before its next node; `dispatch` and `prepareClose` never reject and resolve `cancelled`. The contract exports `PdfActionTree`, `PdfActionNode` and `PdfActionType`.
