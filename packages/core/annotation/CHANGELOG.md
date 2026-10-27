# @embedpdf/core-annotation

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `viewable(annotation, engaged)` takes the annotation instead of its flags, and follows ISO 32000-2 12.5.3 for `invisible`: the flag hides only an annotation of a type that isn't standard (an `unsupported` annotation PDFium doesn't know, other than Projection). On a standard annotation it means nothing. The engine's renderer and flatten follow the same rule, so the viewer no longer paints an unknown annotation that printing and flattening leave out.

- [#895](https://github.com/embedpdf/embed-pdf-viewer/pull/895) by [@bobsingor](https://github.com/bobsingor) – New `textBoxOf(model, id, view?)`: one free text's box whether its text is live or saved and idle. `textBoxes` still lists only the live ones, the boxes a viewer draws as elements; a saved, idle box shows its engine picture there.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A kind's style-panel schema is its `properties`: each `AnnotationProperty` (was `FieldSpec`) names its `control` (`'color'`, `'number'`, `'choice'` with `options`, `'flag'`, `'text'`, `'textFormat'` with `format`, `'link'`). `propertiesOf(kind)` adds the flags every kind has, and `sharedProperties(kinds)` (was `sharedFields`) gives a mixed selection's. A redaction's label is a `'text'` property.

  Snapping is `{ alignment, alignmentThreshold, rotation, rotationAngles, rotationThreshold }` (was `guides`, `guideThreshold`); the alignment threshold is in screen pixels, converted by a pointer sample's new `scale`. Handle chrome nodes say what they reshape (`role`: `'corner'`, `'side'` or `'point'`) and whether they are `active`; `ChromeGeometry.rotationHandle: false` removes the rotation handle from hit-testing. `selectionAnchor()` is `null` while a gesture moves, resizes or turns the selection, `annotationAnchor(model, id)` is new, and render items carry their `annotation`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – New records are named by the object numbers they take:
  - The session holds object numbers for the records it creates next (`Session.objectNumbers`, replacing `seq` and `namePrefix`). A create takes the first, so a new record's ref and key are final from its first frame, and `refOf` returns it. `newRecordsAtMost(message)` says how many numbers a message may need; `update` refuses to make a record it can't name.
  - Replace text is two `create` effects, the strikeout's draft answering the caret by the caret's number. The `createGroup` effect and the `rekey` message are gone.
  - A stamp that fits its drawing `contain` keeps its raster's proportions in a resized box, as the engine draws it.
  - `annotationOfNew(draft, { ref })` no longer takes the record's place on the page.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A callout's selection frame is everything it paints: its box, its line and the ending at its tip, the same box as its `rect`. A selected callout is grabbed on its line or anywhere in that frame, a multi-selection box takes in its line, and a move keeps the whole callout on the page. A selected annotation is now grabbed in its frame or anywhere a click would hit it, so selecting never shrinks where it can be grabbed. An attached link on a text box covers only its box. `isOnTextBox(record, point, margin, view?)` says whether a point is on a text box's own box, where its text is.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A callout is its own kind, `free-text-callout`: `kindOf` returns it for a free text with the callout intent, and render items, behaviors and custom renderers see that name. A callout keeps the turn it was made with, the one that stands it upright on a turned page, so a selected callout shows no rotate knob, rotate 90° and reset rotation leave it as it is, and a selection that includes a callout can't turn or resize as a group. Reset rotation now skips every kind that doesn't turn, so a caret keeps the turn of its text.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation model uses full names. `Point` replaces the `Vec` alias, `ContentGeometry` replaces `Geom`, `ModelAnnotation` replaces `Annot`, and `Message` replaces `Msg`; an annotation's `geom` is `geometry`. Discriminants follow one rule: things that are use `kind` (geometry, hit targets, drafts) and things that happen use `type` (messages, effects). `ChromeGeom` is `ChromeGeometry` and `DEFAULT_CHROME_GEOM` is `DEFAULT_CHROME_GEOMETRY`; a paint's `cap` is `lineCap`; a draft's `cur` is `current`.

  `update(model, message)` returns `{ session, change, effects }` instead of `[model, effects]`: the next session, the records the message changed (`change.put`) or deleted (`change.drop`), and the engine work. The core no longer stores records, so the record messages (`loaded`, `hydrated`, `upsert`, `remove`, `bumpAp`, `created`, `createFailed`) are gone; `rekey` follows a new record to the id it was confirmed under, and `forget` drops session references to records that left the view. `Model` is `Session & AnnotationView`; `initialSession`, `sameSession` and `EMPTY_CHANGE` are exported. Records created by the core get `new:<n>` ids (was `tmp:<n>`). Typing emits a `text` effect, and the `patch` effect no longer carries `apChanged`: whether an appearance changed is the engine's answer. The `delete` effect names the record by `id` (was `ref`), and `delete` and `flags` effects are emitted for records the engine has not confirmed yet too; the plugin writes them once the record's create is confirmed.

  Build annotation views from the engine's records, with shape-specific fields and drawing rules for boxes, lines, polygons, ink, text markup, free text, callouts, and measurement labels. Edits and pending previews use the rect and geometry the engine writes, keeping rotated and upright annotations aligned.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Every style-panel property has a `labelKey` beside its English `label`, the key to translate it by: a panel shows `t(property.labelKey, { fallback: property.label })`, as a command's label reads. The key names the wording, not the field, since one field is called different things by different kinds: `color` is `annotation.style.stroke` on a shape, `annotation.style.outline` on a redaction mark and `annotation.style.borderColor` on a form field. A `choice` property's `options` are `AnnotationOption`s, `{ value, label, labelKey }`, in place of bare values, so line endings, blend modes, fonts, alignments, border styles and icons have English names and keys too (`annotation.lineEndings.openArrow`, `annotation.blendModes.multiply`).

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Model records, drafts, pointer input, render items, chrome nodes and draft/selection anchors identify their page with `page: PageRef`; hit-testing, snapping and view projection take a `PageRef`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The marquee selects what it touches of what each annotation paints: its ink, or the inside of a filled shape, as a click hits it. A box drawn inside an unfilled shape, or in the empty corners of a diagonal line's bounds, no longer selects it; one that touches only a callout's line, an arrowhead, a measurement's caption or a cloud's bumps does. A screen-anchored body counts where it shows at the view. A marquee of no size catches exactly what a click with no margin hits. `selectionInBox(model, page, rect, inert?, view?)` is what a box selects, groups included; the marquee gesture uses it. `quadIntersectsRect` is gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – What an annotation paints is described once, as simple pieces (`PaintedPiece`: ink along a path, a filled polygon, an ellipse). Each shape family says what it paints with `ShapeFamily.painted`, which replaces `ShapeFamily.hit`; `paintedOf(record, view)` adds a measurement's caption and lines. Two questions are asked of the pieces: `paintedNear(pieces, point, margin)` for a click, and `paintedTouches(pieces, rect)` for a rectangle. A rectangle of no size touches exactly what a click with no margin hits. `geomHit` keeps its signature and reads the pieces; `geomPainted` gives them.

  Clicks hit what they hit before, with two exceptions. A cloudy border is hit on its curves: the outer tips of its bumps hit, and the gaps between them don't. The margin around a text box, a caret or a measurement's caption now reaches the same distance in every direction, so its corners are rounded. `distanceHit` and `cloudyBorderExtent` are gone; use `paintedNear(distancePainted(layout, strokeWidth), point, margin)` and `cloudyBounds`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `ModelAnnotation.apVersion` is now `pictureVersion`, and render items carry it (`RenderItem.pictureVersion`). A lent record can carry its lender's live drawing (`ModelAnnotation.painter`): a kind with no live drawing of its own (a form widget) then draws live while a gesture or a change reshapes or restyles it, as a square does, while its raster stays drawn where its shape is. Its item carries the drawing at the box the gesture has (`RenderItem.lentScene`), which `scene(item)` draws in place of the kind's own, and `hasLiveDrawing(item)` says whether an item can be drawn live now. A `glyphs` node carries the font program it draws in (`program`, a `SceneFontProgram`), for whatever draws it to mount.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Add the `createAnnot` message: programmatic creation from page-space geometry that mints the same optimistic annotation and `create` effect a draw tool commits, from the preset's defaults with property overrides layered on top.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every render item carries where it draws: `frame`, the box a painter draws into, its turn and how large the page draws it (below 1 for a NoZoom body zoomed in), and `raster`, the engine's picture inside that frame with its own box and turn. Everything an item draws sits upright inside its frame, so a framework layer paints from these and decides no placement of its own. A plain text box's scene is drawn upright for it; a callout's is unchanged.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – One answer for what a create gesture makes. `gesturePlacement` places the dragged box or segment, or the tool's click default; `placedShape` lays the kind's shape there through the new `ShapeFamily.placed`. The commit, the drawing in progress and a tool's ghost all make these calls, and `unmadeItem` paints an annotation not made yet as the made one will. `clickCreateGeom` and `ClickPlacement` are gone (`Placement` replaces the latter), and free text no longer click-creates without a `clickCreate` policy.

  A line's `ClickCreate` takes `anchor` (`'center'` by default, `'start'`, `'end'`) and `rotation` (degrees clockwise, replacing `angleDeg`), so a clicked line or arrow is centred on the pointer. Under `upright` a click is laid out as the person sees the page: a line points as seen, a centred box keeps its configured width × height and slides inside the page by what the page shows, and a square or circle takes a quarter turn as swapped sides instead of storing a turn. A radio button widget is its own kind, `widget-radio`, drawn round. Render items tell a drawing in progress (`source: 'draft'`) from a tool's ghost (`source: 'ghost'`, with `ghostOpacity`).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The session carries an `editable` rule: which annotations people may change by hand (`true`, `false`, or kinds by subtype, a measurement by its intent). The gesture gates read it beside `locked` and the record's authority, so an annotation it leaves out is selected, hovered and commented on but has no handles, rotate knob or drag, takes no text editing, and the selection's edits and delete skip it. New exports: `isEditableByHand`, `isTransformableByHand`, `isDeletableByHand`, `isContentsEditableByHand`, `editableKindOf` and the `EditableKinds` type.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Add `cssFontFamilyForFont(font)`, `mountedFontFamily(key)` and `STANDARD_FONT_STACKS`: the CSS font family the browser draws an annotation's font with, a standard font's web stack or a registered key's `"epdf-<key>"` face. A redaction's label preview now draws in that family, so a registered font shows in its own face.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Scene nodes gain `glyphs` (text placed character by character, each where the PDF puts it, in a given font, weight and style) and an optional `clip` box on every node.

### Patch Changes

- [#832](https://github.com/embedpdf/embed-pdf-viewer/pull/832) by [@bobsingor](https://github.com/bobsingor) – Keep a free-text callout on the page. The default text box slides fully inside the page while it follows the cursor, and moving the callout stops when the arrow reaches the page edge.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget with an underline border draws its tool ghost with a solid border.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A measurement stays on its page. The offset step of drawing a distance, dragging a distance's leader, and dragging any measurement's caption stop where the measurement would reach past the page's edge; before, only the pointer was kept on the page, so a dimension line or caption built out from it could leave the page. The same rule holds for every handle drag: an end of a line stops before its arrowhead leaves the page, and a turned box's resize stops when a corner reaches the edge. An annotation already past the edge is never pushed further out, and a pointer past the edge still slides it along.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `hitMargin` is in screen pixels: a pointer-down converts it by the page's view scale (`PointerInput.scale`), like `snap.alignmentThreshold`. It was in page points, so a click reached about 200px around an annotation at 25× zoom (much wider than a note's icon) and about 2px at 25%.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A `noZoom` annotation keeps its size on screen at every zoom. Its projection used the resize gesture's scale, which keeps a box at least 4pt, so past about 6× a note grew with the page while its frame still drew a custom look at 1×: a large bubble with small text and a thin border. A gesture's commit at that zoom also stored the annotation larger than it was. `scaleAbout` and `geomScaleAbout` now scale exactly; a resize passes its limit as `minSize`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The redaction label preview lays a label out like the engine: measured in Helvetica, with the engine's line height; a fitted label (`fontSize: 0`) takes the largest size the engine would pick for one line, and a repeated one tiles at 12pt, aligned like the label.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A popup annotation (`/Subtype /Popup`, the window a comment's text shows in) is never painted on the page or hit there: it joins replies and review states on the conversation plane, which the comments UI draws, as Acrobat draws its own window and ignores a popup's appearance. One without an appearance was drawn as a grey box from its rect, which producers put in the page's margin or past its edge. An annotation type the viewer doesn't model is drawn only from its appearance, as its kind said: without one it draws nothing, instead of a box.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add distance drawing with separate endpoint and leader placement, four geometry handles, and directly draggable captions. Keep previews, hit testing, and selection bounds aligned, including short dimensions with outside arrows and displaced-label connectors. Measurement labels use the engine's PDF-coordinate rounding rules.

  Rotate measurements around the center of their complete oriented selection frame, including leaders and displaced captions. Use the same frame for pointer rotation, quarter turns, reset, selection, and hit testing, keeping the center stable after a saved appearance is reloaded. Attach the rotation handle to the selection border without extra measurement-specific spacing.

  Add perimeter and area creation through the existing polyline and polygon gestures, live labels, direct caption dragging, and complete selection bounds. Carry manual PDF-space caption centers through whole-shape transforms while vertex edits leave them fixed. Reject invalid area creation and vertex edits.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add pure helpers for normalizing rich-text runs, mapping text offsets, and reading or applying styles to a text range. Support rich-text updates and bold, italic, and underline properties in the annotation model while keeping plain contents synchronized.

  Align FreeText and callout text insets, borders, and backgrounds with their PDF appearances.

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Session-visibility overlay: `Model.sessionHidden` with `setSessionHidden`/`forgetSessionHidden`/`clearSessionHidden` messages, composed through the new `effFlags`/`effBearer` lenses so Hide actions and scripts flip presentation-only visibility (paint, hit-testing, selectability, handles) without ever touching the document `/F` flags — and a session-SHOWN annotation is live, not painted-but-dead. The overlay survives page reloads and is forgotten only on true deletes.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `sessionHidden`, `effFlags`/`effBearer`, and the session-visibility messages are REMOVED — visibility is document truth again (`/F` flags, mutated through the normal write path), and every paint/hit/selection gate reads the annotation's own flags.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add comment-thread and review-state composition, attached-link substrate
  helpers, conversation-plane filtering, and per-record annotation authority.
  Align annotation grouping, hit testing, geometry, and sparse property updates
  with the new comments, links, and permission model.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Model carets anchored to rotated text as oriented box geometry.
  - Add `caretGeomFromAnchor`, which places the caret at the trailing glyph edge and derives its authoring rotation from the text baseline while preserving the previous byte-identical upright geometry.
  - Carry optional rotation on caret geometry, apply it to local-frame hit testing, and expose an oriented selection outline without enabling caret rotate or resize gestures.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Models text-markup annotations with semantic text quads and adds oriented caret anchors, allowing highlight, underline, strikeout, squiggly, caret, and replace-text geometry to follow the selected text frame.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt annotation domain core. It contains the framework-free annotation model, update/effect logic, content-space geometry, hit testing, and drawing-tool behavior shared by every UI integration.
