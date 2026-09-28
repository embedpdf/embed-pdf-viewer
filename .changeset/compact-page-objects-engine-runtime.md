---
'@embedpdf/engine-runtime': patch
---

Parsed pages take less memory: path objects no longer carry the bounds and matrix that only text and image objects use, and a path's matrix is stored once for every path that has the same one. A CAD drawing of six million strokes now needs 785 MiB of WASM heap instead of 1,169 MiB, and one of 7.6 million 1,520 MiB instead of 2,001 MiB, with byte-identical renders.
