---
'@embedpdf/core': minor
---

A mirror can load on demand: with `onDemand: true` in its spec it stays `idle`, folding confirmed events, until `ensureLoaded()` or `refresh()` asks for its first load, and a resync or a fold's `reload()` before then reads nothing. `Mirror.ensureLoaded()` loads unless loaded or loading: it shares a load in flight, resolves at once when loaded, and tries again after a failed load. `defineState` takes an optional `ensure(capability)`, the verb that loads on-demand state, which each framework's state hook calls for the document it reads.
