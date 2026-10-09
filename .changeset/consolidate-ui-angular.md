---
'@embedpdf/angular': patch
---

The toolbar, commands, search, selection and link bindings use the shared implementations in `@embedpdf/core-ui`, `@embedpdf/web` and the plugins; nothing they do changes. `BoundCommand` comes from `@embedpdf/plugin-commands` (the same fields), the toolbar's view types are aliases of core-ui's, and `copySelection` is `@embedpdf/web`'s, re-exported.
