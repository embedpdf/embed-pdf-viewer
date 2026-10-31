---
'@cloudpdf/engine': minor
---

Thumbnails: `page.render.image({ viewport: { kind: 'thumbnail' } })` asks the server for the page's thumbnail at its own address, so a session with only `doc.render.thumbnail` gets thumbnails, and a CDN serves them apart from full pictures. Print pictures no longer need `doc.render`, and each picture is checked against its own permission before the request when the session's rights are known.
