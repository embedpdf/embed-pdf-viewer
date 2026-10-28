---
'@embedpdf/engine-core': patch
---

The version wire paths and resources are the layer's: `wirePaths.layerVersions`, `layerVersionSignatures`, `layerVersionSignatureContents`, `layerVersionSignatureDigest`, `layerVersionAnalysis`, `layerVersionDownload` and `layerVersionRevision` take the layer name. The resources are now `layer-versions` and `layer-version-*`, so a layer's CDN grant covers only its own versions.

The catalog schema is `LayerVersionsSchema` (`{ baseSha, versions }`, was `DocumentVersionsSchema` with `head`).
