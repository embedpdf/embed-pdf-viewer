---
'@embedpdf/engine-runtime': minor
---

Adds `EPDF_RenderPageBitmapWithMatrix_Start` and `EPDF_RenderPage_Continue`: a page render with a matrix and clip, as `FPDF_RenderPageBitmapWithMatrix` does it, that pauses once a time budget has passed, so the caller can receive other work, or cancel, between slices. `FPDF_RenderPage_Close` ends or cancels it. However finely a render is sliced, its bytes are those of `FPDF_RenderPageBitmapWithMatrix`.

Stops building appearances for closed popups on every render. A render with annotations gave every markup annotation that has contents a popup, and generated that popup's appearance, with a font and two new objects in the document, although a closed popup is never drawn. On a drawing with 704 such annotations this cost 88 ms per render natively and 172 ms in WASM, and grew the WASM heap by about 7 MB per render until the document was closed. A popup's appearance is now generated only when the popup is drawn. The output is byte-identical: the deep tiles of that drawing render in 9 ms instead of 92 ms natively, and 13 ms instead of 185 ms in WASM.

Parsed pages take less memory: path objects no longer carry the bounds and matrix that only text and image objects use, and a path's matrix is stored once for every path that has the same one. A CAD drawing of six million strokes now needs 785 MiB of WASM heap instead of 1,169 MiB, and one of 7.6 million 1,520 MiB instead of 2,001 MiB, with byte-identical renders.

Adds `EPDF_SetDecodedImageBudget` and `EPDF_GetDecodedImageBytes`: a store of decoded images kept across page loads, off by default, so an image rendered again after its page's image cache was emptied is not decoded again. A kept decode renders the same bytes as a new one. It also keeps images above PDFium's 60 MB limit, which PDFium otherwise decodes again from the first row on every render. Closing a document drops its decodes.

Fixes corrupted pixels when a Flate image with a PNG predictor is read a second time in one render, for example because the page draws it twice. It affects images above PDFium's 60 MB limit for keeping decodes, which are decoded again from the start each time they are read: the decoder now predicts the first row from zeros again, instead of from the last row it had decoded.

Resamples 1-bit image masks faster with byte-identical output: where every mask bit under a resampled pixel is clear, or every one is set, the pixel comes from the weights' sum instead of bit by bit. On a flood-map page whose hundred images each carry a 2000 × 2000 mask that is mostly clear, a full-page render takes about 400 ms instead of 720 ms natively, and 480 ms instead of 850 ms in WASM.

Render nested PDF forms with inherited fill opacity applied once, fixing overly faint stamps and other nested form drawings.

Parses the numbers in PDF files faster, with identical values: a number written as an optional sign and at most 15 digits, with at most one decimal point, is decoded directly instead of through the general parser. Pages of CAD plots, whose content streams are mostly coordinates, parse 5–11% faster natively.

Resamples opaque RGB images faster with byte-identical output: the horizontal and vertical passes over 3- and 4-byte pixels read weights and pixels directly and add each channel in two halves, which unsigned arithmetic leaves unchanged. A plan drawn as one 35-megapixel JPEG renders about 12% faster natively and 17% faster in WASM.

Replays repeated paths one call sooner: the rasterizer's output for a path the content stream repeats is now recorded on its first repeat instead of its second, so every run of identical strokes rasterizes once less. A CAD plot of six million strokes renders about 6% faster, with byte-identical output.

Keeps tiling patterns in place at every zoom. For a pattern whose cell box equals its step, the renderer placed each cell a cell width rounded up to whole pixels after the previous one, counting from the pattern's origin, so the rounding added up over the cells between that origin and the page. With the origin hundreds of cells off the page, as in a star chart's hatching, the stripes landed tens of pixels from where the PDF puts them, and somewhere else at every zoom. Every cell is now placed at its own position, rounded to the pixel, as for any other pattern, so the stripes sit where Acrobat shows them.

Renders vector-heavy pages faster with byte-identical output: the rasterizer reuses its buffers across paths instead of allocating them for every path, and content streams build each path without temporary copies. On a CAD plot of six million strokes a full-page render takes about half the time and parsing about a third less. The WASM build is now linked with `-O3`, which makes `embedpdf.wasm` about 9% smaller. Adds `EPDFPage_ResetRenderCache`, which empties a loaded page's image cache so its next render decodes images as a newly loaded page does.

Renders zoomed-in tiles of pages with many objects faster, with byte-identical output. A page or form with at least 1,024 objects keeps the bounds of each run of 128 consecutive objects, computed the first time a render shows at most half of it, and later renders pass over the runs that lie outside their clip instead of testing every object. Moving, adding or removing objects makes the runs out of date, and the next such render computes them again. On a CAD plot of six million strokes, finding what a deep-zoom tile draws drops from about 22 ms to 0.2 ms.

Renders runs of repeated paths faster with byte-identical output: a small path drawn again with the same points, drawing state and target reuses the coverage the rasterizer computed for it, and each repeat is still composited in order. Consecutive identical paths in a content stream now share one geometry. On a CAD plot of six million strokes a full-page render takes about 30% less time and the parsed page about 14% less memory.

The WASM runtime's memory can now grow to 4 GB instead of 2 GB, so a worker with several large documents open no longer runs out at 2 GB. Addresses above 2 GB are read correctly: pointers from the runtime, from `mem.alloc` and from `mem.peek(ptr, 'ptr')` are unsigned, and `mem.peek(ptr, 'ptr')` now returns a `Ptr`, as on the native runtime. Browsers that limit memory lower, such as Safari on iOS, behave as before.
