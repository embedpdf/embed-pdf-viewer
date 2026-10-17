---
'@embedpdf/core': minor
---

`documents.save()` and `documents.saveLayer()` wait for what plugins hold back before they read the file, so the bytes have everything the user sees: text typed a moment ago, a drawing waiting for its next stroke, the text being typed in a form field, and writes still on their way. A plugin registers what it holds back with the new `ctx.onSettle(flush)`, and the kernel runs every flush and waits for it before it reads the file. The caller's `signal`, or closing the document, cancels the wait with `operation-cancelled`. A flush that fails is reported, and the file is then written from what the engine has.

`ctx.serialQueue()` returns a queue with `idle()`, which resolves once everything queued so far has finished; a plugin whose queue carries document writes registers `ctx.onSettle(() => queue.idle())`. The test context from `@embedpdf/core/testing` has `settle()`, which runs the flushes as a download does.
