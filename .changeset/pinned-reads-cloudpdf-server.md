---
'@cloudpdf/server': patch
---

Every versioned read (`…@token`) now answers exactly the state its pins name. The pins are checked before the read and again after it, and a read that a layer write began during is refused as no longer current, so a write can no longer end up cached for a year under an older version. Before, page renders, page text and geometry, appearance batches, outline, metadata, fonts, attachments, layout, actions, search, signatures and downloads checked their pins only before reading, and the annotation and form reads could still send an applied but uncommitted write.
