---
'@embedpdf/engine-runtime': patch
---

Stops building appearances for closed popups on every render. A render with annotations gave every markup annotation that has contents a popup, and generated that popup's appearance, with a font and two new objects in the document, although a closed popup is never drawn. On a drawing with 704 such annotations this cost 88 ms per render natively and 172 ms in WASM, and grew the WASM heap by about 7 MB per render until the document was closed. A popup's appearance is now generated only when the popup is drawn. The output is byte-identical: the deep tiles of that drawing render in 9 ms instead of 92 ms natively, and 13 ms instead of 185 ms in WASM.
