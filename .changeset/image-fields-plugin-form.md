---
'@embedpdf/plugin-form': minor
---

Image fields: a push button whose box shows its image alone (`layout: 'image'`) and does nothing of its own is an image field, filled with a picture.

- `form.setButtonImage(field, { source } | null)` puts a PNG, a JPEG or a one-page PDF in, or takes it out, as one change and one step to undo. It is filling in, gated by `canFill()`; the box says it holds a picture at once.
- Its box is a new `control: 'image'`, with `hasImage`. A box is one when its layout is `image` and no event of the box has an action other than Acrobat's own import-icon script on a press, so an icon-only print or submit button stays `control: 'button'` and keeps its action. Never by the field's name or its picture.
- An image field takes a value: it is `empty` while it holds no picture, so a required one is listed by `validate()`, it shows its purpose's placeholder, its tint and counts as `yours` like any field that takes a value. `prefill()` leaves it.
- Two tools place one: `form-initials` (purpose `initials`, 72 × 36) and `form-image` (120 × 90). `form-signature` places its field with the purpose `signature`, so an empty one shows "Signature".
- `addWidget()` copies the last box's `layout` with its look.
- `getWidgetAt()` says whether the box under the point is an image field's, with `imageBox`, by the same rule.
