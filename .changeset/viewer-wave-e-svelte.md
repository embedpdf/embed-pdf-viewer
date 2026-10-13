---
'@embedpdf/svelte': minor
---

`<KernelProvider {kernel}>` in `@embedpdf/svelte/runtime` gives its content a kernel someone else created and owns, so every function inside works against it; it never starts or destroys the kernel, and reads it once. The full viewer's Svelte wrapper uses it for the components you put in the viewer.

`<Toolbar>`: a custom item your `custom` snippet draws nothing for in the measurement layer (`ctx.layer === 'measure'`), but draws in the live row, is measured where it renders, by the length it reports with `ctx.measure`, instead of counting as 0 px wide.

The development warnings stay out of a production build: they follow `DEV` from `esm-env`, as Svelte and SvelteKit do, which the app's bundler picks by its `development` or `production` condition. The check read `typeof process` before, which a browser doesn't have, so a production build counted as development and showed the warnings to its users.
