---
'@embedpdf/react': minor
---

New `@embedpdf/react/actions` entry with `useActionsUiAdapter` (browser-default URI open through `sanitizeExternalUri` + print dialog, overridable per handler), a `useCapabilityEvent` hook for capability event subscriptions, and link-layer delegation: chain-bearing URI links drop the native `href` fast path so the dispatcher runs the whole chain (the `'dispatched'` outcome opens nothing itself — the adapter owns it).

Widget fill controls become always-active `/AA` event surfaces, link anchors feed link hover events, and scripting-provider defaults use the dispatch origin when deciding whether to suppress lifecycle/boot UI effects.

Route sibling feature dependencies through plugin contract/helper entries. Annotation selection hooks and anchor equality helpers are split into leaf modules so form and annotation-menu entries no longer import the full annotation feature implementation.
