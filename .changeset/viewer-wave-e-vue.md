---
'@embedpdf/vue': minor
---

`<KernelProvider :kernel>` in `@embedpdf/vue/runtime` gives its content a kernel someone else created and owns, so every composable inside works against it; it never starts or destroys the kernel, and reads it once. The full viewer's Vue wrapper uses it for the components you put in the viewer.

`<Toolbar>`: a custom item your `#custom` slot draws nothing for in the `'measure'` layer, but draws in the `'live'` one, is measured where it renders, by the length it reports with `measure`. The hidden measurement layer no longer holds the item's command for it, so the two lengths no longer compete.

The development warnings stay out of a production build. The check read `typeof process` first, which no bundler replaces and a browser doesn't have, so a production build of an app (with Vite, say) counted as development and showed the warnings to its users. It now reads `process.env.NODE_ENV`, which the bundler replaces, and counts as development only on a page with no bundler at all.
