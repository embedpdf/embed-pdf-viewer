---
'@embedpdf/viewer': minor
---

`<embedpdf-viewer>` takes `features`, in its config or as its own property (`element.features`),
and follows it while the viewer runs. Measuring, redaction, building forms and snapshots now start
off: `features: { measurement: true, redaction: true, 'forms.building': true, snapshots: true }`
turns them on. `disable` and `element.disable` are deprecated and go in 4.0.
