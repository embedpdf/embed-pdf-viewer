---
'@embedpdf/web': minor
---

What the layers on a page paint, and the form fields' pictures:

- **`pageLayersOf(page.ref)`:** a layer says which part of the page it paints (`paint('annotations' | 'formFields')`), and the render layer reads `painted()`. `pictureLayerOptionsOf(painted, props, rights)` gives the picture's options, and `partsDrawnTwice` names what a prop draws twice.
- **`loadFieldPictureUrls`** loads a page's field pictures, every state, and **`shownFieldPicture`** picks the one a widget shows.
