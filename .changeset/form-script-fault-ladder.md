---
'@embedpdf/plugin-form': minor
---

Make form scripting fault-tolerant per event: an exception in a Keystroke, Validate, Calculate, or Format script now degrades to a `script-error` diagnostic instead of failing the commit — the typed value survives, a broken validator accepts, a broken calculation is skipped while the `/CO` chain continues, and a broken format keeps the raw value. Only an explicit `event.rc = false` rejects; resource-budget faults still fail the transaction. Keystroke actions also now run Acrobat's real two-event sequence — one paste-shaped typing pass (`willCommit: false`, full replacement in `event.change`) followed by the commit pass (`willCommit: true`, full value in `event.value`) — so Adobe's AF keystroke validators and custom transform scripts both see the contract they were written against.
