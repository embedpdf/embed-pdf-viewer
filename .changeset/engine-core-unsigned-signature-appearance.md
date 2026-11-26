---
'@embedpdf/engine-core': patch
---

A new look on a signature field that nobody signed no longer reads as a forbidden change.

A mark drawn into such a field (`forms.setSignatureAppearance()`) and saved after someone else signed made `analyze()` and `validateSignatures()` read that earlier signature as `forbidden`: "is referenced from object N at AP/N and no rule explains it". Acrobat keeps the signature valid: after an approval signature it reports the document as not modified, and after a certification that allows form filling (`permission: 2`) it reports a permitted change. The engine now reads it as `permitted`, with the rule `signature-appearance`, when the field and its widgets change their `/AP` and nothing else and everything the new appearance draws with is new.

A new look on a signed field stays `forbidden`: it replaces the look the signature was made with. Acrobat doesn't report that change. When an unsigned signature field changes more than its appearance, the analysis now names the keys that changed instead of every reference to the field.

`SIGNATURE_POLICY_VERSION` is 6, so analyses cached on the cloud are computed again.
