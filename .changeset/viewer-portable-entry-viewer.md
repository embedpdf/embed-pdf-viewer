---
'@embedpdf/viewer': minor
---

New `@embedpdf/viewer/portable`: the viewer with the engine's portable build, for toolchains that can't emit the engine's files, such as plain esbuild. Import it in place of `@embedpdf/viewer`; the surface and the config are the same. The WebAssembly comes as a lazy chunk of your own build and both workers start from `blob:` URLs, so a strict policy needs `worker-src blob:` (or copy the two worker files and set `engine.worker` and `engine.encoderWorker`). Nothing is requested from another origin. The npm entries also no longer leave a bare import of a side-effect-free package behind, which esbuild warned about.
