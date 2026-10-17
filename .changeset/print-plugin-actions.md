---
'@embedpdf/plugin-actions': patch
---

The document's print actions run around the kernel's print. The plugin registers `ctx.aroundPrint`, so WillPrint and DidPrint run around every print dialog, and a Named Print action or a script's `this.print()` prints through `documents.print()` when the kernel has a printer (a print a script starts without a user's tap stays refused). Without a printer, the UI adapter's `print()` is used as before.
