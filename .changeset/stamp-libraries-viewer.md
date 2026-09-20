---
'@embedpdf/viewer': patch
---

The built-in stamp library ships inside the viewer instead of being fetched from a CDN. The npm entry keeps `@embedpdf/default-stamps/library` external, so its locale modules become lazy chunks of your own build; the CDN snippet carries them as sibling chunks in its folder. `@embedpdf/default-stamps` is now a dependency. Previously a library build could inline the eight PDFs into the JS chunk as base64, a form webpack rejects.

The viewer registers `stampPlugin()`, exposes `StampToken` through its drive door, and routes the Insert tab's Stamp action to the stamps sidebar. Arbitrary PNG and JPEG insertion remains available through the Insert tab's Image action.

The CDN snippet (`dist/embedpdf.js`) once again finds `embedpdf.wasm` when loaded from another origin: the wasm is now an asset Vite emits into the dist folder and references by a URL relative to whichever chunk needs it, instead of a path guessed against the entry file — which had resolved to `chunks/embedpdf.wasm` and failed. A cross-origin test (`pnpm test` in the viewer package, Playwright against the built artifact) now guards it: the snippet must render with every sibling fetched from its own folder and no request to any other origin.
