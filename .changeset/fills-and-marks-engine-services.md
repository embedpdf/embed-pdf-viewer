---
'@embedpdf/engine-services': patch
---

Fill in a field, or draw a mark into a signature field and sign it, after another signature, and that signature now stays valid. A fill used to stamp who filled the field into its `/EMBD_Metadata`, and a mark recorded its fit on the widget: Acrobat and `analyze()` both read those changes as the document altered after signing. A fill now writes only the value and its drawing, and a widget reads as holding a mark from its drawing alone.
