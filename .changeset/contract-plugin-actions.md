---
'@embedpdf/plugin-actions': minor
---

The actions plugin now follows the 3.0 public contract.

- `ActionsPluginConfig` is `ActionsConfig`; `policy` accepts row-wise patches (name only the origins you change).
- `onAction` is `onExecuted`. New `onOpenSequenceCompleted({ result })` fires once the document-open sequence has run.
- New public methods: `executeNamed(name, context?)` runs a Named verb without building a tree; `getActionTree(source)` reads the raw `/A` or `/AA` tree of an annotation, field, page or the document; `getPolicy()` / `updatePolicy(patch)` read and change the effective policy live; `isScriptingEnabled()` reports whether a script realm exists.
- `registerExecutor` is public (application code can interpret or override an action type); `ActionExecutor` / `ActionExecutorResult` are exported from `/contract`, as are `ActionTriggerEvent`, `eventOf`, `ActionTreeSource`, `ActionPolicyPatch`, `PdfFieldEventKind`, `PdfNamedAction` and `OpenSequenceCompletedEvent`.
- `originOf(trigger)` is `triggerOriginOf` so it no longer shadows the kernel's `originOf(event)` through the framework barrels.
- The plugin is defined on `create()`.
- Internal layout: `contract` / `host-contract` / `model` / `controller` with `services`, `submit`, `scripting`, `dispatch` and `lifecycle` areas; `/internal` no longer exports `createActionsCapability` (the controller is `createActionsController`).
