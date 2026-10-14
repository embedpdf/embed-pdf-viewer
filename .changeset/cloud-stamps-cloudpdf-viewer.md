---
'@cloudpdf/viewer': patch
---

The built-in stamps load in the cloud viewer. The Stamps panel used to show "The built-in stamps could not be loaded." because a stamp library is a PDF that has to be opened in the browser, and the viewer had no local engine for it. `resolveCloudConfig` now gives `stamps.assetEngine` a local engine that is imported the first time someone opens Stamps or Signatures, never at startup. The CDN folder ships `embedpdf.wasm` next to `cloudpdf.js` for it; npm installs leave `@embedpdf/engine` to your bundler. Pass your own `stamps.assetEngine` to replace it.
