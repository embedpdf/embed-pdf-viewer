---
'@embedpdf/viewer-chrome': patch
---

Tell the signer when a signature is sealed without the verification information the settings ask for because the session may not add it. Storing it takes `doc.sign`, which the right to sign a group's fields doesn't give; the viewer then said nothing. It now shows the same notice as when adding it fails.
