---
'@embedpdf/react': minor
---

New `@embedpdf/react/actions` entry with `useActionsUiAdapter` (browser-default URI open through `sanitizeExternalUri` + print dialog, overridable per handler), a `useCapabilityEvent` hook for capability event subscriptions, and link-layer delegation: chain-bearing URI links drop the native `href` fast path so the dispatcher runs the whole chain (the `'dispatched'` outcome opens nothing itself — the adapter owns it).
