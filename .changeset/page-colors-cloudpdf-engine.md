---
'@cloudpdf/engine': patch
---

`page.render.image({ pageColors })` and `page.render.raw({ pageColors })` with anything but `'normal'` are refused with `NotImplemented`: the server draws pages as the file has them. An image is refused before a render token the server does not know is built, and raw pixels inside the server before the server is asked.
