---
'@embedpdf/svelte': patch
---

`<RenderLayer>`'s tiles follow zooms and scrolls again:

- The tile plane's effects read the page and the view through the whole page context, so every camera change released the page right after its new demand (and disposed and re-acquired the view's handle), and the tiles went. They now follow the page and the view only, and a `<PageView>` given another page still releases the old one.
- A tile bound its picture again whenever a re-plan handed it a new `source` object, so every scroll step re-created its URL and hid it until it reloaded. It now binds again only for a new picture.
