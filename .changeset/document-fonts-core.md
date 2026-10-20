---
'@embedpdf/core': minor
---

Add `ctx.measurer`, the host's text measuring: how wide text is in a font program, as the browser that draws it shapes it, for a plugin that lays text out as the engine does. `createKernel({ measurer })` takes a `HostTextMeasurer` (`ready(program)`, which starts loading a program that isn't, `width(program, text, rtl)` in thousandths of an em, and `onReady(listener)`); a browser passes `browserTextMeasurer()` from `@embedpdf/web`. Without one, `ctx.measurer` is `null`. An instance's `onReady` listeners go when it closes. `createTestContext({ measurer })` takes one too.
