---
'@embedpdf/core': patch
---

Make the precompiled Svelte output work on every Svelte 5 runtime

Svelte 5.56 changed the `exclude` argument of the private `rest_props` runtime helper from an array (`exclude.includes(key)`) to a `Set` (`exclude.has(key)`). The `*/svelte` entry points ship precompiled component code, so output built against one side of that change throws on the other: the currently published packages fail with `TypeError: exclude.has is not a function` on Svelte >= 5.56, which aborts the render of every EmbedPDF Svelte component.

The Svelte build now routes those calls through a wrapper that hands the runtime an `exclude` value satisfying both contracts, so one published build stays valid across the whole `svelte: ">=5 <6"` peer range.
