---
'@embedpdf/viewer-chrome': minor
---

A page whose picture takes more than 400 milliseconds to arrive shows a spinner, in the main view and in the thumbnails, in the middle of the part of the page on screen; a page that can't load says so ("This page couldn't load.", or "You don't have access to this page." without `doc.render`), in all 15 languages. Restyle or hide them with the `page-loading` and `page-error` parts, and change the wait with `plugins.render.slowAfterMs`.
