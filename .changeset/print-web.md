---
'@embedpdf/web': minor
---

Add `browserPrinter()`, the browser's print dialog for `createKernel({ printer })`. Where the browser's own PDF viewer prints PDFs (a desktop browser with it on), it prints the kernel's PDF copy from a hidden frame, keeping the frame until the next PDF so the browser can finish; a print the browser refuses rejects, so the kernel prints pictures instead. Everywhere else it prints pictures: one sheet per page, sized to the page with a named `@page`, from a hidden frame, or from the page itself on iOS, which prints a frame as a picture of the page around it. In Safari's engine it `needsTap`: Safari prints only from a tap (later, iOS refuses the print dialog and the Mac prints blank pages). `standardCommandsBrowser` no longer has `print`: printing goes through the kernel.
