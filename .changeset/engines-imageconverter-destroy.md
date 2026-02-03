---
'@embedpdf/engines': patch
---

Fixed memory leak where image encoder workers were never terminated when the engine was destroyed:

- Added optional `destroy()` method to `ImageDataConverter` interface for resource cleanup
- Updated `createWorkerPoolImageConverter` and `createHybridImageConverter` to attach `destroy()` that terminates the encoder worker pool
- Updated `PdfEngine.destroy()` to call `imageConverter.destroy?.()` to clean up encoder workers

Previously, each viewer instance would leave 2 encoder workers running after destruction.
