---
'@embedpdf/plugin-commands': minor
---

Command definitions can resolve any capability again in development builds (the dependency guard no longer hides siblings from `enabled`, `visible` and `run`). `CommandContext.core()` is removed; read the document registry with `get(DocumentsToken)`.
