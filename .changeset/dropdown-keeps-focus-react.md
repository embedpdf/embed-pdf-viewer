---
'@embedpdf/react': patch
---

Keep the focus on a form dropdown after you pick a value. `<FormLayer>` replaced the dropdown's control on every change, so the focus fell to the page and the focus ring stayed on the dropdown after you moved to another field. The dropdown is now one control for as long as its field shows: the focus stays on it, and its ring goes when you leave it.
