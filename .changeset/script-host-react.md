---
'@embedpdf/react': minor
---

`useActionsUiAdapter` is the ONE script UI port: it gains `alert` and `gotoPage` defaults with the origin×phase visibility matrix (lifecycle/boot alerts and non-user print suppressed unless the embedder passes handlers — which receive everything, context attached). `useFormScriptingProvider` and `FormScriptingUiHandlers` are DELETED.
