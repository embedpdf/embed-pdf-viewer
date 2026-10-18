---
'@embedpdf/engine': patch
---

The engine's workers now start under `next dev` when Next.js compiles them, as it does for a package in `transpilePackages` or a linked copy outside `node_modules`. React Fast Refresh used to add `$RefreshReg$` calls to `workers/embedpdf-worker.js`, which don't exist in a worker, so the viewer reported that the engine worker did not start. The worker is now a self-contained IIFE that Fast Refresh leaves alone, and the build checks that it stays that way. The image encoder worker now starts as a module worker, like the engine worker: Next.js appends `import.meta` code to it, which a classic worker can't parse, so encoding fell back to the main thread with a warning.
