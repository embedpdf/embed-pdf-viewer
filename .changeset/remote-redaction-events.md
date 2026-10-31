---
'@cloudpdf/engine': patch
---

A redaction applied in another session now reaches every other open document on its layer as `redaction.applied`, as flattening already does. Before, the event never arrived there: the document kept its pins from before the redaction, and the viewer kept showing the page, its marks, its text and its links as they were until its next refresh.
