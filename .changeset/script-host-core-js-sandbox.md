---
'@embedpdf/core-js-sandbox': patch
---

The `ScriptSandbox`/`ScriptSandboxFactory` structural contract moved to `@embedpdf/core-acrojs` (cycle fix); this package implements and re-exports it, and threads the new annots plane + `annotEffects` through the QuickJS bridge unchanged.
