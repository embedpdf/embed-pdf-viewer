---
'@embedpdf/plugin-annotation': minor
---

The engine's pictures of annotations come through the render plugin (an optional dependency now), which shares and keeps them. Every state is held, so an annotation that only switches its state fetches nothing. Each picture carries the version of its record it shows (`pictureVersion`, which was `apVersion`), and a lender says each lent record's `pictureVersion`. A lender also says when a record's look is `pending` and gives the `painter(record)` that draws it live: a lent record then draws live, with its lender's drawing, while a resize or turn is dragged, while its look is pending, and while its picture is older (a form field resized, restyled or just placed shows at once). `getBakeScale` is removed: layers take the render plugin's `getAppearanceScale`.
