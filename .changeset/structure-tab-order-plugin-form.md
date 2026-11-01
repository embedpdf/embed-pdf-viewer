---
'@embedpdf/plugin-form': patch
---

Tab and `focusNext()` follow a tagged form's reading order on pages whose `/Tabs` says structure, as most forms from Acrobat, Word or LiveCycle do; fields the tags leave out come after the tagged ones, in the order the page lists them.
