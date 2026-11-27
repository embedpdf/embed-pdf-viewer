---
'@embedpdf/svelte': minor
---

`<FormLayer>` shows its controls under any tool that neither fills nor designs the form, such as a stamp, a pen or zoom: the fields keep their tints, edges and placeholders, but the layer is `inert`, so they take no input and no pointer and the tool works over them. Before, the controls stood down under such a tool, so an empty field with no border of its own couldn't be seen while a mark was armed. Controls of the app's own do the same. The placeholder of a signature field and an image field is centred, where the mark and the picture go.
