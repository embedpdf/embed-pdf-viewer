---
'@embedpdf/engine': minor
---

The local engine draws pages in other colors: `page.render.image({ pageColors: 'dark' })` and `page.render.raw({ pageColors: { background: '#0b1d2a', text: '#cfe8ff' } })`, on both the wasm and the native runtime. A `pageColors` that isn't a preset or an object of `'#rrggbb'` colors is refused with `InvalidArg` before it reaches the worker.
