---
'@embedpdf/engine': patch
---

Fill in a field, or draw a mark into a signature field and sign it, after another signature, and that signature now stays valid in Acrobat and in `analyze()`. A fill records nobody now, so `importValues()` needs only what a fill needs, no longer `doc.forms.import`.
