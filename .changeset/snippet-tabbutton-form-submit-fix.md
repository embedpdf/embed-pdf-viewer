---
'@embedpdf/snippet': patch
---

Fixed TabButton component causing unintended form submission when used inside forms. Added `type="button"` to prevent tab buttons from triggering form submit, which was causing the link modal to close immediately when switching to the Page tab.
