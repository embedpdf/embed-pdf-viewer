---
'@embedpdf/plugin-signature': minor
---

Rights per field: `canSign(field)` and `canFill(field)` take the field, and signing, filling and clearing a field are refused for a field the user may not sign or fill in (`fields:sign:group=seller`). The annotation plugin is optional: placing a mark as a stamp without it is refused as `unsupported`.
