---
'@cloudpdf/engine': patch
---

`page.render.image({ pageColors })` with anything but `'normal'` is refused with `NotImplemented`, instead of building a render token the server does not know: the server draws pages as the file has them.
