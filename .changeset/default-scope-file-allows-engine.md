---
'@embedpdf/engine': minor
---

A document opened without a `scope` allows what the file allows, as in Acrobat: everything for an unprotected PDF, and a protected PDF keeps its own restrictions (no printing, no copying…) until its owner password lifts them. The default is `pdf.permissions` plus what no PDF flag governs: `doc.download`, `doc.download.flattened`, `doc.annotate.import`, `doc.forms.import`, `doc.forms.script`, `doc.forms.submit`, `doc.sign.certify`, and putting annotations and fields in any group. It was `['*']`, which ignored the file's restrictions, with a console warning, now gone. `scope: ['*']` still allows everything.
