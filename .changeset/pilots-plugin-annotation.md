---
'@embedpdf/plugin-annotation': minor
---

Page-space `create(input)`: build an annotation from page-space geometry (`bounds`, `from`/`to`, `vertices`, `strokes`, `quads`) through the same optimistic commit path the draw tools use; resolves with the durable ref after `onCreated` fires. The PDF-space draft path is now `createRaw(page, draft)`. New confirmed-change events on the kernel primitive: `onCreated`, `onUpdated`, `onDeleted`, fired once per confirmed fact, local or remote, with a `ChangeOrigin`.
