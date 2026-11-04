---
'@cloudpdf/server': minor
---

`/head` carries this server's engine value for each kind of cached read: a digest of the rules and fonts it computes that kind with, never of its release, so a deploy that changes nothing keeps every cached answer. Every versioned read checks the token's engine value and shape: a shape newer than the server answers is refused, and another engine value is answered with this server's own answer, uncached, and its value in `EmbedPDF-Engine` (exposed to browsers), so nothing is cached under a value that doesn't describe it and no request fails during a rolling deploy. Renders are stored by engine value. The manifest no longer carries `serverFonts`.
