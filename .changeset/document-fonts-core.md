---
'@embedpdf/core': minor
---

Add `ctx.measurer`, the host's text measuring: how wide text is in a font program, as the browser that draws it shapes it, for a plugin that lays text out as the engine does. `createKernel({ measurer })` takes a `HostTextMeasurer` (`ready(program)`, which starts loading a program that isn't; `refused(program)`, for one the host can't use; `width(program, text, rtl)` in thousandths of an em; and `onChange(listener)`, called when a program is ready or refused); a browser passes `browserTextMeasurer()` from `@embedpdf/web`. Without one, `ctx.measurer` is `null`. An instance's `onChange` listeners go when it closes. `createTestContext({ measurer })` takes one too.
