---
'@embedpdf/react': minor
---

Widget fill controls become always-active event surfaces: the wrapper (not the gated control) carries pointer/focus handlers feeding `notifyWidgetEvent`, so a read-only session (no `doc.forms.fill`) still gets `/AA` hover tooltips — "may edit" and "may receive events" are different rights. Link anchors feed link `/AA` events the same way. `useFormScriptingProvider`'s defaults honor the new origin axis: lifecycle/boot alerts and non-user print requests are suppressed unless the embedder supplies handlers (which receive every effect, origin attached).
