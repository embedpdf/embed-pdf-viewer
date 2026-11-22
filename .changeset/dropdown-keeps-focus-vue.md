---
'@embedpdf/vue': patch
---

Keep the focus on a form dropdown after you pick a value. `<FormLayer>` replaced the dropdown's control on every change, so the focus fell to the page. The dropdown is now one control for as long as its field shows, so the focus stays on it.
