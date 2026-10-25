# @embedpdf/plugin-annotation

## 3.0.0-next.16

### Minor Changes

- [#895](https://github.com/embedpdf/embed-pdf-viewer/pull/895) by [@bobsingor](https://github.com/bobsingor) – New host read `getTextItem(ref, view?)`: one free text's text item (its runs, body style and box) in every state, saved and idle included. A renderer that draws a text box itself reads it, since no engine picture is drawn under its element. `listTextItems` is unchanged: it lists only the text boxes the layer draws as elements.

### Patch Changes

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – The annotations of pages an undo brings back are read again.

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – When pages go, come or come back, the pages whose annotations link to them are read again, so a link to a deleted page that an undo brought back works again.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `create(page, fields)` also takes a read of another annotation and makes the same one again (a copy): its own fields are written, and where it is comes from `page`. A kind the engine doesn't know (`subtype: 'unsupported'`) is refused with `invalid-input`, as is a value only another app can write (a beveled border).

  A tool's `meta` is your own data again: the plugin never reads it. The calibrate tool captures its line by its id (and so does a tool that extends it), so `meta: { capture: true }` on your own tool no longer turns its drawing into a calibration.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The plugin's `refKey` is gone; model ids are the engine's `annotationKey`, so a map keyed by ref in application code can never disagree with the plugin's own. Names (`nm`) are now keyed with their page, closing a collision between same-named annotations on different pages in legacy PDFs. Event lookups compose the address from the event's page and stable id.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every annotation action is one change:
  - Moving, restyling, deleting, grouping or ungrouping a selection is one change and one request, however many annotations it touches. A replace-text pair, and a link with its children, are one change too. The engine applies a change all or nothing, and answers changes in the order they were made, so what shows never falls back to an older edit.
  - A new annotation has its final ref from the moment it shows: it can be selected, edited, linked or deleted at once.
  - Typing into a free text is one change per pause, sent after the pause, when editing ends, when anything else changes, and before a download.
  - A stamp shows its drawing the moment it's placed, and keeps its proportions when it's resized.
  - `renderAppearances` resolves `AnnotationAppearancePicture`s: the engine's pictures, and the preview of a stamp placed a moment ago.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The capability has nouns: `selection` (`set`, `add`, `selectAll`, `selectInRect`, `clear`, `list`, `update`, `updateLink`, `getProperties`, `delete`, `rotateBy`, `resetRotation`, `group`, `ungroup`, `canGroup`, `canUngroup`, `getAnchor`, `getRotationAnchor`), `draft` (`get`, `finish`, `cancel`), `text` (`begin`, `end`, `getEditing`, `toggleFormat`), `tools` (`list`, `get`, `register`, `getDefaults`, `updateDefaults`, `getProperties`, `onDefaultsChanged`), `stamps` (`arm`, `disarm`, `isArmed`, `place`), `links` and `comments`. The flat names they replace are gone, and so are `getSelection`, `hasCreationDraft`, the selection flag reads and writes (flags are properties: `selection.update({ locked: true })`), `createAttachment` (create an attachment with `create()` and a `rect`) and `readAttachment`.

  New: `getAt(page, point)` returns the annotation; `getHovered()` and `onHoverChanged`; `move(refs, toIndex)` shows the new drawing order at once and fires `onMoved`; `export()` (after pending writes) and `import()`, with `AnnotationTransfer` from the package; `downloadResource(ref, role)`. `canUpdate(ref)` (was `canEdit`). `onDeleted` carries every ref that went (`refs`). Comments have a check per verb (`canReply`, `canSetText`, `canSetStatus`, `canSetMarked`, `canDelete`, `canDeleteThread`; `getPermissions` is gone), and `comments.reply()`, `createFromSelection(tool)`, `draft.finish()` and `stamps.place(stamp, { page, center })` resolve the records they made. Page arguments take a ref or an index, and every async verb takes a `signal`.

  Settings come from `annotationPlugin(config)` over `ANNOTATION_DEFAULTS`, with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`: `snap` (`alignment`, `alignmentThreshold` in screen pixels), `chrome` (`accent`, `outline`, `handles` with `shape`, `rotationHandle` with `enabled` and `stalk`, `guides`, `marquee`, `textOutline`, `readout`), `afterCreate` (`select`, `tool: 'stay' | 'default'`, `editText`, also per tool) and `tools`. Tool defaults take any field of the kind but where it goes, flags and `contents` included. `annotationState` declares `{ status, selected, hovered, editing }`. Code never changes the selection unless it asks (`select: true`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Annotations stay in sync through one path for every origin: a records mirror loads the document's annotations and folds each confirmed event, whether this session or another made the change, and a create is matched to its confirmation by the `/NM` the client assigns. Writes no longer re-read after they resolve.
  - Host lens: `whenSynced()` replaces the hydration members; `getArmedStamp()` and `renderArmedStampPreview(width)` replace `getStampArmEpoch()`/`getArmedStampPreview()`.
  - Flattens, form imports and form repairs now update the annotation list and repaint widgets.
  - The `/internal` entry is removed; hosts use `/contract/host`.
  - A change the user makes shows at once and is dropped when its engine write settles, success or failure, so a refused change shows the engine's record again (including another session's edit made meanwhile) instead of staying on screen or restoring an old copy. This fixes a refused delete hiding the annotation, refused flags staying, and a refused restyle erasing a collaborator's change.
  - `onWriteFailed` reports a refused change and the annotations it carried. An `Annotation` has `pending: true` while a change to it waits for the engine, and its `raw` is always the engine's confirmed record.
  - Each pending change holds exactly what one write carries, so settling one write never drops other outstanding work on the same record: typed text waiting for its write survives a flags change or an update of another field, and changes settle in the order they were made even when the engine answers out of order.
  - An edit or a delete of a new annotation made before the engine confirmed it is written once the create is, and the selection follows the annotation to its engine key. A refused create drops the changes queued behind it.
  - When a page re-read fails, accepted changes stay on screen and `getStatus()` reports `error` until a load succeeds, instead of showing stale records.
  - A page's render items are rebuilt only when something on that page changes.
  - Typing never shows an older engine echo over newer text.
  - Direct-object annotations without `/NM` (addressed by position) keep one record when the engine names them on an edit, and leave no ghost when deleted.
  - An annotation that gets another key (a new one confirmed, a direct-object one the engine names) takes everything with it: typing still waiting for its write, the text range, a link sync in progress, and its pending changes. A write always goes to the annotation now at a position, never to one the engine named away from it.
  - A new annotation stays on screen when the engine answers its create while a page read is running, and can be edited at once. A link set on it before the engine answered is written once it has. Deleted elsewhere before its create answered, it stays deleted.
  - A refused text write drops every keystroke it carried, and `onWriteFailed` fires once for it, naming the annotation by its current ref.
  - An annotation with a pending restyle keeps rendering live when another session updates it.
  - Every annotation the plugin creates carries an `/NM`.
  - A programmatic update keeps rendering from the engine's appearance and fetches it again when the engine re-bakes it.

  The public annotation API reads and writes the engine's kind-specific records and page-space geometry. New annotations use one set of defaults and retain the rect returned by the engine; the viewer, tools, and pending edits draw from that same confirmed shape. Annotation transfer, groups, text markup, and callouts follow the updated engine contract.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The annotation contract, on the kernel's `create()` hook. The public read model is the page-space `Annotation` record (`ref`, `page`, `subtype`, `bounds`, `geometry`, `props`, `flags`, `contents`, `author`, `createdAt`, `modifiedAt`, `group`, `inReplyTo`, `authority`, `raw`), reference-stable per entry: `get`, `list(filter?)`, `listSelected`, with the engine records on `getRaw`/`listRaw`. New reads: `hitTestAt`, `getStatus`, `refresh`, `getCreationDraft`, `getEditingRef`, `listTools`/`getTool`, `getToolDefaults` (was `currentDefaults`), `listPropSpecs` (was `propsForTool`), `getSnapSettings`/`getChromeSettings`.

  Writes are page space and awaitable: `update(ref, { bounds | geometry, props, flags, contents, richText })` (the engine patch is `updateRaw`), `updateMany`, `setRotation`/`rotateBy`, `setContents`/`setRichText` (resolve on the engine's confirmation), `createMany`, `createFromSelection(subtype)` (was `markupFromSelection`; also `'insert-text'`, `'replace-text'` and `'redact'`), `createAttachment`, `deleteMany`. Selection: `select` takes one or many refs, new `selectAll`/`selectInRect`, `clearSelection` (was `deselect`), `getSelectionAnchor` (page space; a view env is optional), and `updateSelection`/`updateSelectionFlags`/`deleteSelection` resolve with a `BatchResult`; `rotateSelectionBy(±90)`, `resetSelectionRotation`, `toggleTextFormat`, `finishCreationDraft` (resolves with the ref; covers ink), `endTextEdit` are awaitable. `setToolDefaults`/`updateSnapSettings`/`updateChromeSettings`; `setFilePickerProvider` returns its remover; `readAttachment` (was `downloadAttachment`); `links.get` (was `of`). Comments: `listThreads`, `getThread`, `setText`, `delete`, `deleteThread`, `getPermissions` (hydration moved to `getStatus`/`refresh`) plus `comments.onThreadChanged`. Events: `onCreated`/`onUpdated` carry `annotation` and `raw` (was `dto`); new `onResynced`, `onSelectionChanged`, `onDraftChanged`, `onEditingChanged`. Refusals are `PluginError`s (`permission-denied`, `not-found`, `invalid-input`, `unsupported`).

  Host (`/contract/host`, which now also carries `previewBucket` and the handler priorities): `listPageItems`, `listTextItems`, `listChromeNodes`, `listLinkItems`, `getAppearanceEpoch`, `getBakeScale`, `renderAppearances`, `pdfToPageRect`, `getHydration`, `deliverRemoteEvent`, `getEditingId`, `draftContents`/`draftRichText` (the editor's debounced path; the public `setContents`/`setRichText` commit at once), `getCssFontFamily`, `getHitKind`, `getCursorAt`, `hoverGhostAt`, `getImageGhost`, `getArmedStampPreview`, `getStampArmEpoch`, `listResolvedTools`, `getResolvedTool`, `getToolSubtype`, `getBehaviorFor`; `onDraftCaptured` is an event hook. Removed: `selection()`, `ensurePage`, `rotateSelection90`, `getSelected`, `comments.hydration`/`rehydrate`. Deferred: `reorder` (needs an engine verb), `duplicate`. `LinkNavItem.rect` is `bounds`.

  Internally the plugin is now one folder per concern (`services/`, `read/`, `write/`, `sync/`, `comments/`, `tools/`) assembled by `controller.ts`; `types.ts` is split into `contract.ts`, `host-contract.ts` and `model.ts`. The `/internal` entry is removed; hosts use `/contract/host`. `ArmedStampPreview` is exported from `/contract` (it is part of the public `StampPreviewProvider` signature).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `create()` accepts an area redaction (`{ subtype: 'redact', bounds }`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `lend(lender)` (host): a sibling plugin lends its records, and they are selected, moved, resized, restyled, reordered and deleted with the annotation tools. Each edit of a lent record is its owner's ops in the same change as the rest of the edit, so a drag of form fields and annotations together is one change and one undo step. The form plugin lends its widgets in design mode.
  - A stated `update()` or `delete()` of a lent record is refused, naming its owner; `reorder()` reorders lent records through their owner in the same change. Lent records aren't grouped, and `list()` leaves them out.
  - A push button tool's defaults take text styling (`widget-button`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Undo and redo with `@embedpdf/plugin-history`:
  - The selection follows them: an undo selects what was selected before the change, as far as it still shows, and a redo what was selected after it.
  - Annotations an undo brings back return in their place, with the picture they had, before the engine answers; a page an undo returns to how it was a moment ago asks the engine for nothing.
  - The pauses of one typing session into a text box are one step.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The properties `getProperties()` and `tools.getProperties()` give carry a `labelKey` beside each English `label`, and a choice's `options` are `{ value, label, labelKey }` (`AnnotationOption`, exported): show `t(property.labelKey, { fallback: property.label })` to translate a style panel.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `create(page, draft)`, `list(page)`, stamp placement, hover and every host method that names a page take a `PageRef`; selection and creation-draft anchors, text items, tool ghosts, calibration captures and recalibration reports carry `page`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `selectInRect` selects exactly what dragging the same box on the page selects: what the rect touches of what each annotation paints, with the rest of each one's group, leaving out annotations an engaged tool makes inert. It used to select whatever the rect's area overlapped of an annotation's bounds.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The engine's pictures of annotations come through the render plugin (an optional dependency now), which shares and keeps them. Every state is held, so an annotation that only switches its state fetches nothing. Each picture carries the version of its record it shows (`pictureVersion`, which was `apVersion`), and a lender says each lent record's `pictureVersion`. A lender also says when a record's look is `pending` and gives the `painter(record)` that draws it live: a lent record then draws live, with its lender's drawing, while a resize or turn is dragged, while its look is pending, and while its picture is older (a form field resized, restyled or just placed shows at once). `getBakeScale` is removed: layers take the render plugin's `getAppearanceScale`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Page-space `create(input)`: build an annotation from page-space geometry (`bounds`, `from`/`to`, `vertices`, `strokes`, `quads`) through the same optimistic commit path the draw tools use; resolves with the durable ref after `onCreated` fires. The PDF-space draft path is now `createRaw(page, draft)`. New confirmed-change events on the kernel primitive: `onCreated`, `onUpdated`, `onDeleted`, fired once per confirmed fact, local or remote, with a `ChangeOrigin`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An `AnnotationAnchor` for an annotation that keeps its size on screen, such as a note, carries `boundsIn(view)`: its box in any view, so UI attached to it follows the zoom without the anchor changing. The anchor stays the same object until the annotation itself moves.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `onCreated`, `onUpdated` and `onDeleted` carry the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. A create the session may not make rejects with `error.permission` set to `'annotations:create'`, the name the engine refuses with; the message used to name a `doc.annotate.create` permission that doesn't exist.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `annotation.reorder(refs, position)` replaces `move(refs, toIndex)`, and `onReordered` (the page's new `order`) replaces `onMoved`. The new order shows at once, by neighbour, and the records take the engine's order from `annotations.reordered`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A tool's `ghost` is `true`, `false` or `{ opacity }` and works for every tool whose click places something: shapes, lines and arrows, free text, notes, stamps and the form plugin's field tools. It is the annotation the click will make, drawn from the tool's live defaults through the same placement the commit uses, and it shows only where the click would reach the tool and the user may create: it hides over annotations and text, stays through a press until it becomes a drag, and clears when the gesture ends. The ghost handler and `ANNOTATION_GHOST_PRIORITY` are gone; the handler that takes the click shows the ghost. `getToolGhost` is `getImageGhost` (the armed stamp's image, now with its opacity), and a sibling plugin reports its placement gesture with `previewPlacement` instead of `setPlacementPreview`. The built-in square, circle and line tools are `upright`, so a click lays them out as the page shows.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Add the `editable` setting: which annotations people may change by hand, `true` (the default), `false`, or a list of kinds by subtype, a measurement by its intent (`'line-dimension'`). One it leaves out can still be selected, read and commented on, but not moved, resized, turned, restyled, typed in or deleted by hand; it changes live with `updateSettings()`. Code still changes it, and `canUpdate()` and `canDelete()` stay the same. New `isEditable(ref)`. A double click on a text box whose text may not change now selects it instead of doing nothing.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation layer asks for each annotation's look at rest only, in every state, and paints the state the annotation shows: a check box keeps both its pictures, so switching it needs no new image.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A double-click opens a text box's text only on its box or a resize handle on its border. On a callout's line, its tip or knee, or the empty rest of its frame, the press goes through as a normal press.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The built-in callout tool's style panel edits the `free-text-callout` kind's fields, which are the same as a free text's. Its callouts show no rotate knob; on a turned page they are still created upright.

- [#832](https://github.com/embedpdf/embed-pdf-viewer/pull/832) by [@bobsingor](https://github.com/bobsingor) – Keep a callout, polygon, or polyline following the cursor between clicks after the pointer leaves the page. The preview slides along the page edge and picks the cursor back up inside the page.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the interaction contract (`getActiveToolId`, `claimCursor`). The markup bridge reads the selection through `getSnapshot` / `listSegments` and the `onChanged` / `onCommitted` hooks.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`; page ↔ PDF conversion goes through the kernel's page geometry instead of a copy of its own.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A download includes the text typed a moment ago and an ink drawing waiting for its next stroke. Typed text is written once typing pauses, and a grouped ink drawing once its grouping window ends, so a download in between, such as an autosave or a save shortcut, could miss them. They are now written first. A stroke still being drawn is left as it is.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation records no longer follow form events: a form field's widgets come with the form, so a value, a new field or a signing reads no page again.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Follows the removal of `forms.imported`: a form import now fires one `forms.created` or `forms.valueSet` per field.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Uses the widget's engine-computed annotation address (`widget.ref`) instead of composing one by hand: the annotation plane keys widget appearance bumps by it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Hover and the cursor hit-test annotations with the hit margin in screen pixels, converted by the page's view scale, so the area that picks an annotation stays the same size on screen at every zoom.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Annotation tools register with the interaction plugin's `touch` (`'draw'` for drawing and text-markup tools, `'tap'` for click-to-place tools) instead of `touchDirect`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The text markup tools read whether the user is still selecting from the selection's public `isSelecting()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `annotation.selection.set([])` selects nothing, as its name says; before, an empty list left the selection as it was.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `AnnotationToolInput` type-checks without `strictNullChecks` too: changing a built-in tool (`{ id: 'highlight', defaults }`) and extending one (`{ id: 'approved', extends: 'free-text', … }`) were errors in plain JavaScript and in non-strict apps, because a missing `?: never` key couldn't tell the shapes apart. The keys a shape doesn't take are `?: undefined` now; strict code accepts exactly what it did.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The CSS font family for a registered font is `"epdf-<key>"`, the family `mountWebFont` mounts it under, so a page's own family of the same name never replaces it in the text editor or a drawn text box.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add distance and calibration presets, point-based viewport scale selection, and per-annotation recalculation reports. Persist leader and caption edits in native PDF fields, preserve the measured endpoints during offset edits, and keep derived measurement values read-only in comments.

  Use the standard selection spacing for measurement annotations.

  Keep locally created and edited measurements vector-rendered after the engine saves their appearance, matching the existing annotation lifecycle and avoiding repeated switches to raster rendering.

  Add area and perimeter presets with scale snapshots captured at the first vertex. Persist shape captions and derived values through ordinary annotation edits, retaining vector rendering after engine responses.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add selection-aware rich-text editing for FreeText annotations. Font, size, color, bold, italic, and underline changes apply to selected text while editing, or to the annotation's default style otherwise.

  Expose text-format commands and selection state, preserve styled runs through debounced writes, and map registered font families to the live editor's mounted fonts.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Refresh widget appearances after visual signature fills and signing, and reload annotations when a new document version is published. Add box styling for signature widgets and expose annotation interaction priorities and the armed-stamp tool ID for cooperating plugins.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Stamps can be placed without the pointer and ghosted at any zoom. `placeStamp(input, placement)` creates a stamp annotation by code — the same validation, fit, page clamp, `/Name`, and `/Subj` a click after `armStamp` produces — and resolves to the new annotation's ref; `StampPlacement` names the page, the anchor point, an optional width, and rotation. `StampToolInput` gains `name` (the placed `/Name`) and `subject` (the placed `/Subj`), and its `preview` now also accepts a `StampPreviewProvider`: a function the hover ghost asks for a render at the device pixel width it is displayed at. Requests are bucketed to powers of two (`previewBucket`) and cached per bucket for the arm's lifetime, so a zoom gesture never renders per frame. The host capability's `armedStampPreview(devicePixelWidth?)` is now asynchronous and takes that width.

  `armStamp` no longer clears the payload it just set when activating the built-in stamp tool from another active tool. Armed stamps now place correctly instead of falling through to the tool's source callback, while the legacy `annotation-stamp` tool tag remains supported.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Registers the action engine's session-visibility sink (`applySessionVisibility` on the host lens) when `@embedpdf/plugin-actions` is present, and carries the full activate action tree + annotation ref on `LinkNavItem` so the nav layer can delegate chains to the dispatcher.

  The pointer-driven hover diff feeds annotation `/AA` cursorEnter/cursorExit through the shared hover pump while reducer-side clears, widgets, links, and tree-less items stay inert. `LinkNavItem` also carries hover-event presence flags for the link plane.

  Publish bundle-safe `/contract` and `/contract/host` entries over the same annotation token, plus the focused `/authoring` helper entry. `/internal` keeps its implementation-helper meaning and no longer serves as the sibling bundle boundary.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The session-visibility overlay is RETIRED — `applySessionVisibility` is replaced by `commitScriptEffects`, the annotation DOCUMENT-commit sink: script/Hide effects become engine `annotations.update` patches (colors crossing the Acrobat-array → engine boundary, `/AP` regenerated engine-side), authority-enforced, stop-on-failure, with the owner reconciling its own model per touched page.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add whole-document annotation hydration with event replay and desync
  recovery, a comments and review-state API, and an attached-link lens backed by
  substrate annotations. Add per-record permission checks and keep conversation
  records out of painting, hit testing, and selection.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add touch-aware tool consent, hit targets, drag handling, and cancellation so annotation editing cooperates with navigation gestures. Text-edit operations now report whether they handled a gesture, and the annotation capability token includes a missing-plugin hint.

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add `markupFromSelection()` for creating one oriented text-markup annotation per selected page and clearing the consumed selection. Multi-click draft finish and cancel actions are also available on the public annotation capability for composable menu controls.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Round-trip rotated caret geometry through the annotation repository.

  Rotated carets now lower their logical box and content-space tilt into `/Rect`, `rotation`, and `unrotatedRect`, and reconstruct that geometry when engine annotations are ingested. Upright writes explicitly clear stale transform metadata.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Creates, previews, imports, and persists text-markup annotations with oriented quads and places caret and replace-text annotations at the selected glyph's trailing edge.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the completely rebuilt annotation plugin for EmbedPDF v3. It connects the pure annotation model to engine-backed create, update, and delete operations while contributing editing and drawing tools through the interaction system.
