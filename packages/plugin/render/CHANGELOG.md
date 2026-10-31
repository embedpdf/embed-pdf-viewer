# @embedpdf/plugin-render

## 3.0.0-next.20

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Rewritten on the kernel's `create()` controller hook with a public contract (`/contract`) and a host lens (`/contract/host`). Public: `canRender`; `renderPage(page, { width? | scale?, includeAnnotations?, format?, quality?, signal? })` renders at the requested size exactly (no snapping) and shares the raster cache with the view layers; new `renderThumbnail(page, { maxWidth })` and `renderPages(pages, { concurrency? })` (a `BatchResult<PageRender, PageRef>`, reported in input order); `getRenderPolicy` (was `renderPolicy`), `getRenderEpoch` (was `renderEpoch`), `invalidate({ pages?, scope? })`, and the `onInvalidated` event hook (`{ pages, scope, origin }`) for every confirmed pixel change, own or remote. Refusals are `PluginError`s (`permission-denied`, `not-found`, `operation-cancelled`, `operation-failed`). `RenderConfig` replaces `RenderPluginOptions`.

  Host (`RenderHostCapability`): `renderSource` (the conforming viewer door, was `renderPage`), `getSourceKey` (was `renderSourceKey`), `conformViewport`, `getPaintSettings` (reference-stable; was `paintSettings`), `createViewDemand(viewId)` (was `tilesFor`) returning a `ViewDemand` whose reads are pure — `setDemand` schedules, `getPlan` reads the plan it produced, `markPainted`/`markUnpainted`/`release`/`dispose` — and `onRenderCompleted` / `onRenderFailed`. Tile regions are converted to PDF space by the kernel's page space (crop offsets included); `toEngineRect`/`tileEngineRect` are gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Pictures by family, and the form fields' own pictures:
  - **What a picture draws:** `includeFormFields` next to `includeAnnotations` (`PageLayerOptions`), on `renderPage`, `renderThumbnail` and the layers' doors. An option left out draws what the user may read, so a token that may render but not read annotations gets its pictures; asking for what the user may not read is refused.
  - **Keys and redraws per family:** each picture is cached and redrawn by what it draws. Annotation changes redraw pictures with annotations, form changes (`forms.*`, signings) pictures with fields. `invalidate()` takes `scope: 'fields'`, and `getRenderEpoch(page, layers?)` takes the options.
  - **Field pictures for the form layer:** `renderFieldAppearances(page, { scale })`, every widget in every state, shared between the views that paint them, with `getFieldAppearanceEpoch(page)` and `getAppearanceScale(renderScale)`.
  - **For the layers:** `getLayerRights()`, what the user may read of each part.
  - A reorder (`annotations.reordered`) redraws the page again.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `tiles.fadeMs` is removed: new tiles show the moment they're ready, with no fade. `getPaintSettings()` returns `{ tiles }`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `renderPage`, `renderSourceKey`, `conformViewport`, `renderEpoch` and every tile method take a `PageRef`; `invalidate({ pages })` replaces `{ pons }`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – One appearance door for annotations and form widgets: `renderAppearances(page, { family, scale, items, signal })` fetches the engine's pictures of the owner's items, at rest and in every state, each tagged with the version of its item it shows. Asks for the same page, family, scale and items share one fetch, the last few sets of each page are kept, and `keptAppearances(family, item)` gives an item's last pictures after it left its page. `renderFieldAppearances` and `getFieldAppearanceEpoch` are removed: a widget's picture version is the form plugin's.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `onInvalidated` carries the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`, and null for the `invalidate` verb as before. A render refused without `doc.render` has `error.permission` set to `'doc.render'`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The render settings are live: `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`, over `RENDER_DEFAULTS` (`fullPage`, `tiles`, `format`, `quality`, `debug`), for every open document. A new budget, tile size or format applies at once: pages re-plan and redraw. `RenderConfig` is now `DeepPartial<RenderSettings>`.

  `renderPage`, `renderThumbnail`, `renderPages` and `getRenderEpoch` take a page's ref or its index, and so does `invalidate({ pages })`, which skips a page that isn't in the document; `getRenderEpoch` reads such a page as `0`. `renderPages` reports a failed page as it was given, and `renderPage`, `renderThumbnail` and `renderPages` reject `operation-cancelled` as soon as their `signal` fires.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Rasters are also invalidated by page and annotation flattens (content scope), by a completed signature (the sealed widget's page), and by a desynced event stream (every page, content scope, no origin).

  Render requests and appearance reads use the revised page-space targets and document render options across local and cloud engines.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `samePageViewDemand(left, right)` to the contract, to compare two tile demands by value. The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Follows the removal of `forms.imported`: a form import now fires one `forms.created` or `forms.valueSet` per field.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the render token, paint-plan vocabulary, settings, and capability types without raster or plugin wiring.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add `canRender()` and reject unauthorized page and tile renders locally with
  `PermissionDenied`, avoiding repeated engine requests for sessions without
  render access.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#777](https://github.com/embedpdf/embed-pdf-viewer/pull/777) by [@bobsingor](https://github.com/bobsingor) – Scope tile state by view and page so multiple views of the same page can plan rasters independently without invalidating each other. Replace the flat tile methods with a reference-stable `render.tilesFor(view)` handle that binds the view identity for planning, paint reporting, and release.

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Add a configurable render strategy for exact and lattice-backed deployments, with separate full-page and tile-plane budgets, format conformance, settled level selection, and public paint settings.

  Deep-zoom tiling now uses bled overlap, presentation-aware generation retention, bounded fetch backpressure and raster residency, stage-less demand limits, stronger raster identities, failure isolation, and optional diagnostics. These changes keep tile memory bounded while preventing stale reuse, visible seams, and quality regressions during zoom and pan transitions.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the document-scoped rendering capability for EmbedPDF v3. It conforms page requests to the engine's render policy, manages abortable raster loading, and provides the tile planning and retention system used for sharp deep zoom.
