---
'@embedpdf/plugin-signature': patch
---

`canFill()`, `fillField()` and `clearField()` now ask for the right the engine has always asked for: the right to sign the field (`doc.sign`, or `fields:sign` for its group), not the right to fill fields in. A mark in a signature field is its signer's to place. Before, a session that could only fill fields in was told `canFill()` and then refused by the engine, and a session that could only sign was refused by the plugin although the engine allowed it.
