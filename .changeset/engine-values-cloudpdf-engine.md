---
'@cloudpdf/engine': minor
---

Cached reads copy each kind's engine value from `/head` into their URLs, with the shape this client reads. An answer that names another engine value (`EmbedPDF-Engine`) makes the next cached read learn `/head` again.
