---
'@embedpdf/angular': patch
---

- `controlOf()` follows its field at once: the form shows a write as soon as it's made, so the control takes the field's value, a refused or rewritten one included, without waiting for the engine.
