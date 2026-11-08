---
'@embedpdf/viewer-svelte': minor
---

The viewer takes a `features` prop, which it follows while it runs: what people can do, a feature or a
part on or off (`features={{ measurement: true }}`). Measuring, redaction, building forms and snapshots now start off until
`features` turns them on. `disable` is deprecated and goes in 4.0.
