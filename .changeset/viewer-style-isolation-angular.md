---
'@embedpdf/angular': patch
---

The toolbar's default "More" menu no longer lays an invisible backdrop over the whole page: it closes on a press anywhere outside it and its button.

The render layer no longer adds a `<style>` element to the page (the tile fade's keyframes are gone with `tiles.fadeMs`), so it needs no nonce under a `style-src` without `'unsafe-inline'`.
