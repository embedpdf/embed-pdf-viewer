---
'@embedpdf/plugin-redaction': minor
---

Unified marquee redaction with the selection plugin's marquee infrastructure. Removed standalone `createMarqueeHandler`, `registerMarqueeOnPage`, `RegisterMarqueeOnPageOptions`, and `MarqueeRedactCallback`. Marquee redaction now subscribes to selection plugin's `onMarqueeChange` and `onMarqueeEnd` events and forwards them via new `onRedactionMarqueeChange` method. Enabled marquee for `RedactionMode.Redact` and `RedactionMode.MarqueeRedact` modes via `enableForMode`. Added page activity claims (`redaction-selection` topic) in legacy mode for scroll plugin page elevation.
