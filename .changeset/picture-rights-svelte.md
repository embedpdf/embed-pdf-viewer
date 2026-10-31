---
'@embedpdf/svelte': minor
---

`<RenderLayer thumbnail />` draws the page's thumbnail instead of its full picture: one small picture of the whole page, without tiles, which needs only `doc.render.thumbnail`. Use it in a strip of thumbnails or a page picker, so they show for sessions that may have thumbnails but not render pages.
