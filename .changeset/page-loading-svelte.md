---
'@embedpdf/svelte': minor
---

`usePictureState()` gives a layer of a page whether that page's picture is on screen in its view: `{ current: { status, slow } }`, from the render plugin's `getPictureState`. Show a loading indicator while `status` is `'loading'` and `slow` is true. `<RenderLayer>` reports its page `loading` until its whole-page picture is on screen, and a render that fails; the box it lends a plugin that paints the pictures hands that plugin the page's report.
