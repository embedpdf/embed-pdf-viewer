---
'@embedpdf/web': minor
---

Add `browserPrinter()`, the browser's print dialog for `createKernel({ printer })`: one sheet per page, sized to the page with a named `@page`, printed from a hidden frame, or from the page itself on iOS, which prints a frame as a picture of the page around it. `standardCommandsBrowser` no longer has `print`: printing goes through the kernel.
