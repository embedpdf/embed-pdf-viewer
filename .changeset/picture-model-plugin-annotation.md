---
'@embedpdf/plugin-annotation': minor
---

The engine's pictures of annotations come through the render plugin (an optional dependency now), which shares and keeps them. Every state is held, so an annotation that only switches its state fetches nothing. Each picture carries the version of its record it shows (`pictureVersion`, which was `apVersion`), and a lender says each lent record's `pictureVersion`. `getBakeScale` is removed: layers take the render plugin's `getAppearanceScale`.
