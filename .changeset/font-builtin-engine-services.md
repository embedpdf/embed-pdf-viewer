---
'@embedpdf/engine-services': patch
---

The engine's font list says which of its fonts are the fallback fonts it comes with (`builtIn`). Registering a font key that is already registered keeps the first font and registers nothing, as `FontSpec` promises, so a font is never in the runtime twice.
