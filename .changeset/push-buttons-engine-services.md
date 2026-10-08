---
'@embedpdf/engine-services': minor
---

Push buttons are created (family code 1) and their widgets drawn by the runtime's push-button generator, with the caption written through `EPDFAnnot_SetMKText` and read back for push buttons only. A caption on another family's widget is refused; its `caption: null`, as its row reads, is dropped. A widget update draws the widget again only when the update's appearance decision says so, so a move, new actions or a row sent back keep the drawing a file has.
