---
'@embedpdf/snippet': patch
---

Fix toolbar buttons (e.g. Previous/Next Page) remaining keyboard-focusable while disabled. The shared `Button` component computed disabled styling but never applied the native `disabled` attribute, so a disabled button still received keyboard focus during Tab navigation.
