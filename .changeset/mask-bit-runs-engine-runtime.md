---
'@embedpdf/engine-runtime': patch
---

Resamples 1-bit image masks faster with byte-identical output: where every mask bit under a resampled pixel is clear, or every one is set, the pixel comes from the weights' sum instead of bit by bit. On a flood-map page whose hundred images each carry a 2000 × 2000 mask that is mostly clear, a full-page render takes about 400 ms instead of 720 ms natively, and 480 ms instead of 850 ms in WASM.
