---
'@embedpdf/engines': patch
---

fix(engines): `usePdfiumEngine` now discards the engine it created if the effect was torn down before init resolved, instead of committing it. This stops React Strict Mode's dev remount from creating two engines, remounting engine-keyed consumers (e.g. `<EmbedPDF>`) mid-load, and leaking the first engine. Engine teardown also captures its target locally so a `wasmUrl` change mid-init can no longer destroy the replacement engine.
