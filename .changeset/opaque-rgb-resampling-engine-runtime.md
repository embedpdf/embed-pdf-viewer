---
'@embedpdf/engine-runtime': patch
---

Resamples opaque RGB images faster with byte-identical output: the horizontal and vertical passes over 3- and 4-byte pixels read weights and pixels directly and add each channel in two halves, which unsigned arithmetic leaves unchanged. A plan drawn as one 35-megapixel JPEG renders about 12% faster natively and 17% faster in WASM.
