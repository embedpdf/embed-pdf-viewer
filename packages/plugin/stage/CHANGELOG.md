# @embedpdf/plugin-stage

## 3.2.0

### Minor Changes

- [#1051](https://github.com/embedpdf/embed-pdf-viewer/pull/1051) by [@bobsingor](https://github.com/bobsingor) – A wheel or trackpad scroll over the Stage no longer gets stuck at the end of the pages. A scroll that begins where the pages can't scroll any further the way it pushes now scrolls the page around the viewer, as it does at the end of any scrolling element. A scroll that reaches the end stops there, momentum included, and the next one scrolls the page. On a trackpad the next swipe is the next one, also while the last still coasts. In paged flow a push past the edge still turns the page while there is one to turn to, and on a trackpad every swipe now turns one: a swipe that began while the last one still coasted turned nothing. The new `scrollChaining` setting is on by default. Set it to `false` in an app where the viewer fills the window, and the Stage keeps every wheel over it, as before: a sideways swipe the pages can't follow then never reaches the browser's back gesture.

## 3.1.0

## 3.0.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt document stage plugin. It combines scrolling, viewport measurement, zoom, pan, spread layouts, navigation, and coordinate conversion through pure intents and selectors built on `@embedpdf/core-stage`.

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The main stage lens registers `goto` and `named` action executors with the action engine when present: GoTo destinations reveal through the camera, NextPage/PrevPage/FirstPage/LastPage execute, unknown named verbs report inert.

  The stage lens also reports placed/current/visible page state and user-versus-programmatic motion causes to the action lifecycle coordinator.

  Publish a bundle-safe `/contract` entry and a focused `/destination` helper entry so camera consumers do not pull in stage reducer/effect/plugin wiring.

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Expose transient `cameraResting` state and defer page-origin device snapping while zoom is moving. Pages retain fractional placement through continuous zoom and snap once the camera settles, preventing anchor jitter and per-step content movement without sacrificing crisp resting placement.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Stage events are derived from state changes in one place, with unchanged payloads. `StageAction` is no longer exported and the state's `vp` field is `viewport`. A controller built directly (`createStageController`) exposes the full `StageHostCapability` type, so optional parameters stay optional.

  Stage layout, reveal, and navigation use durable page references and page-space coordinates, including transforms for pages with nondefault boxes and rotation.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The stage capability follows the contract dictionary, split into a public contract (`/contract`) and a host lens (`/contract/host`).

  Reads: `getCamera`, `getViewpoint`, `getViewportSize`, `getZoomLevel`, `getZoomMode`, `getViewRotation`, `getSettings` (the one place for `flow`/`layout`/`spread`/`sizing`/`bounded`/`pageFrame`/…), `getViewState`, `getCurrentPage`, `getCurrentPageIndex`, `listCurrentItemPages`, `listVisiblePages`, `isPageVisible`, `getPageFrame`, `getPageAt`, `listActiveRules`, `matchesRule`, `isMoving`, `canGoNext`, `canGoPrevious`. Writes: `zoomIn`/`zoomOut`/`zoomTo`/`zoomBy`, `fitWidth`/`fitPage`/`fitAll`/`fitAutomatic`, `goToPage(ref)`/`goToPageIndex`/`goToFirstPage`/`goToLastPage`/`nextPage`/`previousPage`, `reveal(ref)`/`revealIndex`/`revealRect`, `scrollTo`/`scrollBy`/`panBy`/`setCamera`/`stopMotion`, `setViewRotation`/`rotateViewBy`, `setFlow`/`setLayout`/`setSpread`/`setSizing`/`updateSettings`/`resetSettings`/`resetView`/`applyViewState`, `setResponsiveRules`. Coordinates are page space ⇄ viewport: `pageToViewport`, `viewportToPage`, `pageRectToViewport`. Events: `onPageChanged`, `onZoomChanged`, `onCameraChanged`, `onMotionEnded`, `onSettingsChanged`, `onViewportChanged`.

  Host (`StageHostCapability`, same runtime token): `setViewportSize`, `setDevicePixelRatio`, `beginGesture`/`endGesture`, `fling`, `doubleTapZoom`, `zoomAround`, `getScrollMetrics`, `worldToViewport`/`viewportToWorld`/`pageToWorld`, `provideInitialView`, `placeInitial`, `refit`, `getLensId`.

  Removed: the per-setting getters, `pages()` and `pageCount()` (the page list is document truth: `documents.listPages`), `visiblePages`, `currentPage`, `currentItemPages`, `pageRect`, `pageAt`, `pointOnPage`, `pageRectToScreen`, `toScreen`/`toWorld`, `setViewport`, `cameraInMotion`, `automatic`, `next`/`prev`, index-taking `goToPage`/`reveal`, `lensId`, `update`, `setResponsive`, `matches`, `activeRules`.
  - Internal layout: `contract` / `host-contract` / `model` / `controller` with `services`, `read`, `camera`, `navigation`, `settings`, `view` and `sync` areas; the plugin is defined on `create()`.
  - `StageState` / `StageAction` are host-lens types now (`@embedpdf/plugin-stage/contract/host`), no longer exported from `/contract` or the package root.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `getCurrentDestination()` says where the view is as a destination: the page reaching past the top of the view, the point where `goToDestination()` puts one (a padding in from the top-left), and no zoom, so going there again keeps the reader's zoom.

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add responsive container-query settings and named active rules. Add gesture lifecycle, elastic overscroll, fling, anchored double-tap zoom, and lens identity APIs, while removing the deprecated interaction settings and moving wheel classification to `@embedpdf/web`.

- [#920](https://github.com/embedpdf/embed-pdf-viewer/pull/920) by [@bobsingor](https://github.com/bobsingor) – The `zoom` tool's box. On the host lens, `beginZoomDrag`, `moveZoomDrag`, `endZoomDrag({ zoomOut })` and `cancelZoomDrag` run the drag, and `getZoomBox()` gives the box in viewport pixels for an adapter to draw. A box zooms straight in, about the one point that stays put, until it fills the view, centered; it glides with `scrollBehavior`. A click (under 4 pixels) zooms one step around the point. `createZoomDragHandler(stage, interaction)` connects it to the interaction hub. The new `zoomBox` setting (`{ fill, stroke }`, `null` follows the accent) colors the box. `zoomIn()` and `zoomOut()` take `{ around }`, like `zoomTo` and `zoomBy`. `reveal()` with a fit now stops at the zoom limit (64×) instead of zooming past it on a tiny rect. Under a tool with a `gapCursor` (pan, zoom), the pan fallback no longer takes drags between pages. A fit mode, a level or `resetSettings()` asked for again now applies after a zoom the user made: before, `fitAutomatic()` after a zoom step, pinch, double-tap or zoomed `reveal` did nothing when automatic was already the setting, and so did `zoomTo()` with the last level set.

- [#999](https://github.com/embedpdf/embed-pdf-viewer/pull/999) by [@bobsingor](https://github.com/bobsingor) – `reveal()`'s `rect` is `rect?: Rect`: left out is the whole page, and `null` is no longer taken. A `zoomBox` change that gives a color as `undefined` follows the accent, instead of storing `undefined`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `pages()` entries, `visiblePages()` and `pageAt()` results carry `ref: PageRef`; `pageRect`, `pointOnPage`, `pageToWorld` and `pageRectToScreen` take a `PageRef`.

- [#958](https://github.com/embedpdf/embed-pdf-viewer/pull/958) by [@bobsingor](https://github.com/bobsingor) – In paged flow, pushing past the edge of the page turns it, as readers expect from a wheel, a trackpad and a finger. Scroll or swipe past the bottom for the next page, at its top; past the top for the previous page, at its bottom; or swipe sideways past the edge (the other way in a right-to-left document). A tall page stops at its bottom first, and the next push turns it. One gesture turns one page, and its momentum doesn't scroll the page that arrives. The new `turnGestures` setting (default `true`) turns this off, leaving page turns to `nextPage()`, `previousPage()` and navigation. Nothing changes in continuous flow.

- [#957](https://github.com/embedpdf/embed-pdf-viewer/pull/957) by [@bobsingor](https://github.com/bobsingor) – `listCurrentPages()` gives the pages you're on: the current spread while it fits across the view, its two pages side by side however tall they are, else the current page alone. `nextPage()` and `previousPage()` step past those pages, and `canGoNext()` and `canGoPrevious()` say whether there's a page after or before them. A spread that fits across the view but is taller than it used to step one page at a time, so Next from 1–2 went to page 2, already on screen, and nothing moved; and on the second page of the first or last spread, Previous or Next was enabled and did nothing. A spread that fits across the view also lands at its top, like a page.

- [#933](https://github.com/embedpdf/embed-pdf-viewer/pull/933) by [@bobsingor](https://github.com/bobsingor) – Lock settings for one document: `stage.lockSettings({ settings, by, reasonKey? })` holds them at a value over `updateSettings()`, the responsive rules, a restored view state and `resetSettings()`, which still change the settings underneath, so the user's own choice is back when the lock goes. It returns the function that lets go; otherwise the lock lasts until the document closes. A second lock on a setting at another value is refused (`conflict`), naming the holder; at the same value both hold. `getLock(setting)` says who holds a setting and why. Every setting but `zoom` can be locked. Taken in a plugin's `connect()`, a lock holds from the Stage's first layout. `getViewState()` saves the locked settings as they are underneath the lock.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `StageState`, what `stageState` reads and `useStageState()` returns, the State table of the Stage page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/contract/host`, is now `StageModel`, made by `initialStageModel()`, so `StageState` has one meaning.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – Read shapes are `readonly`, the settings included. Follows core-geometry and core-stage: `Rotation`, `PageGeometry`.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – `padding` takes `{ top, right, bottom, left }` beside one number, room for a toolbar floating over one edge. A change names only the sides it sets (`{ bottom: 56 }`) and the others are 0, as with `pageFrame`; `getSettings().padding` is what was given, with every side. The fit modes, the clamp, the scrollbars, arrivals and the wrapped grid's line width use each side, and a `'center'` or fractional placement shifts by half the difference between two sides, so equal sides place the content where they did.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – `StageViewState.pageIndex` replaces `cursor`. `getPageBox()` replaces `getPageFrame()`, since `PageFrame` is a setting. A reveal's alignment is `align?: RevealAlignment`, its values `ArrivalAlignValue` (were `anchor`, `RevealAnchor` and `RevealAnchorValue`, a copy of it). Settings events carry `changedKeys`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The Stage's state is declared once as `stageState` (`zoomLevel`, `zoomMode`, `currentPageIndex`, `currentPage`, `pageCount`, `viewRotation`, `activeRules`), which each framework turns into its state hook. New `getPageCount()`. `getCurrentPage()` and `onPageChanged`'s `page` are the page's `PageRef` (was its `PageInfo`). `isPageVisible`, `getPageFrame`, `viewportToPage`, `pageToViewport` and `pageRectToViewport` take a page's ref or its index, and read a page that isn't in the document as `null`/`false`.

  Settings change only through `updateSettings()`: `setFlow`, `setLayout`, `setSpread` and `setSizing` are gone. How a view takes pointer input is now its own settings, `interaction`, `panFallback` and `zoomGestures` (all `true` by default), so a thumbnail strip registers `stagePlugin({ token, interaction: false, zoomGestures: false })` and can change them while the app runs. A `pageFrame` may name only the sides it reserves (`{ bottom: 20 }`); the others are 0. `getSettings()` returns the same object until a setting changes. GoTo and Named page actions now move the view by its `scrollBehavior` setting instead of always gliding.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – The Stage has zoom limits: the `minZoom` and `maxZoom` settings, `0.05` and `64` by default (5% to 6400%). Nothing zooms past them: not `zoomIn()`, a pinch or Ctrl+wheel, `zoomTo()`, `zoomBy()`, `setCamera()`, a reveal or a destination, and not a fit mode, which stops at the limit. When the limits change, a zoom outside them moves to the nearest one; a `minZoom` above `maxZoom` counts as `maxZoom`. `canZoomIn()` and `canZoomOut()` say whether the zoom is below `maxZoom` or above `minZoom`, for disabling your buttons.

  `zoomIn()` and `zoomOut()` step through round levels (100%, 125%, 150%, 200%, 300% and so on) in place of ×1.2. From a level in between, such as a fit, they go to the next one, and a level within 5% of a round one steps past it.

### Patch Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Allow `RevealOptions.rect` to be `null` and align stage coordinate conversion
  with the content-space page transform API.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token and state instead of type arguments. The Stage keeps its settings per view, outside the definition, so its definition's settings type is `NoSettings`; `getSettings`, `updateSettings` and `resetSettings` work as before.

- [#777](https://github.com/embedpdf/embed-pdf-viewer/pull/777) by [@bobsingor](https://github.com/bobsingor) – Double-tap from a pinched-in zoom returns to fit-width instead of climbing (the iOS rule). The zoom ladder previously picked "the first posture meaningfully above the current zoom," so a pinch to a level between fit-width and detail made a double-tap zoom IN further. The rule is now: the ladder ascends only from ON a rung (within ±10% of a posture) — a tap at a posture moves to the next, wrapping past the top — while a pinch to any other level is leaving the ladder, and a double-tap there RESETS to the base fit ("take me back to reading"), never a further zoom-in. Everything that already felt right is unchanged: zoomed-out → fit-width, fit-width → detail, detail → fit-width.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Navigation called before the stage has a size is no longer lost. `goToPage()`, `goToFirstPage()`, `goToLastPage()`, `nextPage()`, `previousPage()`, `reveal()` and `goToDestination()` called as the document opens wait for the first placement; the last call lands instantly after the initial view (or a restored one), so the first frame already shows it. A PDF's open action to a page now opens there too.

- [#779](https://github.com/embedpdf/embed-pdf-viewer/pull/779) by [@bobsingor](https://github.com/bobsingor) – Keep page and scrollbar screen geometry hidden until initial viewport placement commits. Stage consumers no longer receive origin-based placeholder geometry while viewport, responsive settings, and camera state are being initialized, preventing pages from rendering at the top-left before their final placement.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The stage's frame loops (navigation and zoom tweens, the fling, the camera-rest countdown) are owned by its instance: the frames still scheduled when the document closes are cancelled, and none are scheduled after. One of them used to write into the closed instance ("a state update after the instance closed") whenever a page was torn down mid-countdown.

  After placement, a viewport report with no area (a hidden container, or one taken out of the page before its stage is torn down) keeps the last real viewport and the view, instead of fitting to a 0 × 0 box and firing viewport, zoom and camera events. Shown again at its size, the stage carries on where it was.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A viewport report of the size the stage already has is now a no-op. It used to count as a resize: it cancelled a navigation still animating and re-applied the old anchor, so a `reveal()` asked for as the view opened (before the ResizeObserver's first callback repeated the size) kept its zoom but never moved.

## 3.0.0-next.23

### Minor Changes

- [#999](https://github.com/embedpdf/embed-pdf-viewer/pull/999) by [@bobsingor](https://github.com/bobsingor) – `reveal()`'s `rect` is `rect?: Rect`: left out is the whole page, and `null` is no longer taken. A `zoomBox` change that gives a color as `undefined` follows the accent, instead of storing `undefined`.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – Read shapes are `readonly`, the settings included. Follows core-geometry and core-stage: `Rotation`, `PageGeometry`.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – `StageViewState.pageIndex` replaces `cursor`. `getPageBox()` replaces `getPageFrame()`, since `PageFrame` is a setting. A reveal's alignment is `align?: RevealAlignment`, its values `ArrivalAlignValue` (were `anchor`, `RevealAnchor` and `RevealAnchorValue`, a copy of it). Settings events carry `changedKeys`.

## 3.0.0-next.22

## 3.0.0-next.21

### Minor Changes

- [#958](https://github.com/embedpdf/embed-pdf-viewer/pull/958) by [@bobsingor](https://github.com/bobsingor) – In paged flow, pushing past the edge of the page turns it, as readers expect from a wheel, a trackpad and a finger. Scroll or swipe past the bottom for the next page, at its top; past the top for the previous page, at its bottom; or swipe sideways past the edge (the other way in a right-to-left document). A tall page stops at its bottom first, and the next push turns it. One gesture turns one page, and its momentum doesn't scroll the page that arrives. The new `turnGestures` setting (default `true`) turns this off, leaving page turns to `nextPage()`, `previousPage()` and navigation. Nothing changes in continuous flow.

- [#957](https://github.com/embedpdf/embed-pdf-viewer/pull/957) by [@bobsingor](https://github.com/bobsingor) – `listCurrentPages()` gives the pages you're on: the current spread while it fits across the view, its two pages side by side however tall they are, else the current page alone. `nextPage()` and `previousPage()` step past those pages, and `canGoNext()` and `canGoPrevious()` say whether there's a page after or before them. A spread that fits across the view but is taller than it used to step one page at a time, so Next from 1–2 went to page 2, already on screen, and nothing moved; and on the second page of the first or last spread, Previous or Next was enabled and did nothing. A spread that fits across the view also lands at its top, like a page.

## 3.0.0-next.20

### Minor Changes

- [#933](https://github.com/embedpdf/embed-pdf-viewer/pull/933) by [@bobsingor](https://github.com/bobsingor) – Lock settings for one document: `stage.lockSettings({ settings, by, reasonKey? })` holds them at a value over `updateSettings()`, the responsive rules, a restored view state and `resetSettings()`, which still change the settings underneath, so the user's own choice is back when the lock goes. It returns the function that lets go; otherwise the lock lasts until the document closes. A second lock on a setting at another value is refused (`conflict`), naming the holder; at the same value both hold. `getLock(setting)` says who holds a setting and why. Every setting but `zoom` can be locked. Taken in a plugin's `connect()`, a lock holds from the Stage's first layout. `getViewState()` saves the locked settings as they are underneath the lock.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – `padding` takes `{ top, right, bottom, left }` beside one number, room for a toolbar floating over one edge. A change names only the sides it sets (`{ bottom: 56 }`) and the others are 0, as with `pageFrame`; `getSettings().padding` is what was given, with every side. The fit modes, the clamp, the scrollbars, arrivals and the wrapped grid's line width use each side, and a `'center'` or fractional placement shifts by half the difference between two sides, so equal sides place the content where they did.

## 3.0.0-next.19

### Minor Changes

- [#920](https://github.com/embedpdf/embed-pdf-viewer/pull/920) by [@bobsingor](https://github.com/bobsingor) – The `zoom` tool's box. On the host lens, `beginZoomDrag`, `moveZoomDrag`, `endZoomDrag({ zoomOut })` and `cancelZoomDrag` run the drag, and `getZoomBox()` gives the box in viewport pixels for an adapter to draw. A box zooms straight in, about the one point that stays put, until it fills the view, centered; it glides with `scrollBehavior`. A click (under 4 pixels) zooms one step around the point. `createZoomDragHandler(stage, interaction)` connects it to the interaction hub. The new `zoomBox` setting (`{ fill, stroke }`, `null` follows the accent) colors the box. `zoomIn()` and `zoomOut()` take `{ around }`, like `zoomTo` and `zoomBy`. `reveal()` with a fit now stops at the zoom limit (64×) instead of zooming past it on a tiny rect. Under a tool with a `gapCursor` (pan, zoom), the pan fallback no longer takes drags between pages. A fit mode, a level or `resetSettings()` asked for again now applies after a zoom the user made: before, `fitAutomatic()` after a zoom step, pinch, double-tap or zoomed `reveal` did nothing when automatic was already the setting, and so did `zoomTo()` with the last level set.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – The Stage has zoom limits: the `minZoom` and `maxZoom` settings, `0.05` and `64` by default (5% to 6400%). Nothing zooms past them: not `zoomIn()`, a pinch or Ctrl+wheel, `zoomTo()`, `zoomBy()`, `setCamera()`, a reveal or a destination, and not a fit mode, which stops at the limit. When the limits change, a zoom outside them moves to the nearest one; a `minZoom` above `maxZoom` counts as `maxZoom`. `canZoomIn()` and `canZoomOut()` say whether the zoom is below `maxZoom` or above `minZoom`, for disabling your buttons.

  `zoomIn()` and `zoomOut()` step through round levels (100%, 125%, 150%, 200%, 300% and so on) in place of ×1.2. From a level in between, such as a fit, they go to the next one, and a level within 5% of a round one steps past it.

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `StageState`, what `stageState` reads and `useStageState()` returns, the State table of the Stage page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/contract/host`, is now `StageModel`, made by `initialStageModel()`, so `StageState` has one meaning.

## 3.0.0-next.16

### Minor Changes

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `getCurrentDestination()` says where the view is as a destination: the page reaching past the top of the view, the point where `goToDestination()` puts one (a padding in from the top-left), and no zoom, so going there again keeps the reader's zoom.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Stage events are derived from state changes in one place, with unchanged payloads. `StageAction` is no longer exported and the state's `vp` field is `viewport`. A controller built directly (`createStageController`) exposes the full `StageHostCapability` type, so optional parameters stay optional.

  Stage layout, reveal, and navigation use durable page references and page-space coordinates, including transforms for pages with nondefault boxes and rotation.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The stage capability follows the contract dictionary, split into a public contract (`/contract`) and a host lens (`/contract/host`).

  Reads: `getCamera`, `getViewpoint`, `getViewportSize`, `getZoomLevel`, `getZoomMode`, `getViewRotation`, `getSettings` (the one place for `flow`/`layout`/`spread`/`sizing`/`bounded`/`pageFrame`/…), `getViewState`, `getCurrentPage`, `getCurrentPageIndex`, `listCurrentItemPages`, `listVisiblePages`, `isPageVisible`, `getPageFrame`, `getPageAt`, `listActiveRules`, `matchesRule`, `isMoving`, `canGoNext`, `canGoPrevious`. Writes: `zoomIn`/`zoomOut`/`zoomTo`/`zoomBy`, `fitWidth`/`fitPage`/`fitAll`/`fitAutomatic`, `goToPage(ref)`/`goToPageIndex`/`goToFirstPage`/`goToLastPage`/`nextPage`/`previousPage`, `reveal(ref)`/`revealIndex`/`revealRect`, `scrollTo`/`scrollBy`/`panBy`/`setCamera`/`stopMotion`, `setViewRotation`/`rotateViewBy`, `setFlow`/`setLayout`/`setSpread`/`setSizing`/`updateSettings`/`resetSettings`/`resetView`/`applyViewState`, `setResponsiveRules`. Coordinates are page space ⇄ viewport: `pageToViewport`, `viewportToPage`, `pageRectToViewport`. Events: `onPageChanged`, `onZoomChanged`, `onCameraChanged`, `onMotionEnded`, `onSettingsChanged`, `onViewportChanged`.

  Host (`StageHostCapability`, same runtime token): `setViewportSize`, `setDevicePixelRatio`, `beginGesture`/`endGesture`, `fling`, `doubleTapZoom`, `zoomAround`, `getScrollMetrics`, `worldToViewport`/`viewportToWorld`/`pageToWorld`, `provideInitialView`, `placeInitial`, `refit`, `getLensId`.

  Removed: the per-setting getters, `pages()` and `pageCount()` (the page list is document truth: `documents.listPages`), `visiblePages`, `currentPage`, `currentItemPages`, `pageRect`, `pageAt`, `pointOnPage`, `pageRectToScreen`, `toScreen`/`toWorld`, `setViewport`, `cameraInMotion`, `automatic`, `next`/`prev`, index-taking `goToPage`/`reveal`, `lensId`, `update`, `setResponsive`, `matches`, `activeRules`.
  - Internal layout: `contract` / `host-contract` / `model` / `controller` with `services`, `read`, `camera`, `navigation`, `settings`, `view` and `sync` areas; the plugin is defined on `create()`.
  - `StageState` / `StageAction` are host-lens types now (`@embedpdf/plugin-stage/contract/host`), no longer exported from `/contract` or the package root.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `pages()` entries, `visiblePages()` and `pageAt()` results carry `ref: PageRef`; `pageRect`, `pointOnPage`, `pageToWorld` and `pageRectToScreen` take a `PageRef`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The Stage's state is declared once as `stageState` (`zoomLevel`, `zoomMode`, `currentPageIndex`, `currentPage`, `pageCount`, `viewRotation`, `activeRules`), which each framework turns into its state hook. New `getPageCount()`. `getCurrentPage()` and `onPageChanged`'s `page` are the page's `PageRef` (was its `PageInfo`). `isPageVisible`, `getPageFrame`, `viewportToPage`, `pageToViewport` and `pageRectToViewport` take a page's ref or its index, and read a page that isn't in the document as `null`/`false`.

  Settings change only through `updateSettings()`: `setFlow`, `setLayout`, `setSpread` and `setSizing` are gone. How a view takes pointer input is now its own settings, `interaction`, `panFallback` and `zoomGestures` (all `true` by default), so a thumbnail strip registers `stagePlugin({ token, interaction: false, zoomGestures: false })` and can change them while the app runs. A `pageFrame` may name only the sides it reserves (`{ bottom: 20 }`); the others are 0. `getSettings()` returns the same object until a setting changes. GoTo and Named page actions now move the view by its `scrollBehavior` setting instead of always gliding.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token and state instead of type arguments. The Stage keeps its settings per view, outside the definition, so its definition's settings type is `NoSettings`; `getSettings`, `updateSettings` and `resetSettings` work as before.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Navigation called before the stage has a size is no longer lost. `goToPage()`, `goToFirstPage()`, `goToLastPage()`, `nextPage()`, `previousPage()`, `reveal()` and `goToDestination()` called as the document opens wait for the first placement; the last call lands instantly after the initial view (or a restored one), so the first frame already shows it. A PDF's open action to a page now opens there too.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The stage's frame loops (navigation and zoom tweens, the fling, the camera-rest countdown) are owned by its instance: the frames still scheduled when the document closes are cancelled, and none are scheduled after. One of them used to write into the closed instance ("a state update after the instance closed") whenever a page was torn down mid-countdown.

  After placement, a viewport report with no area (a hidden container, or one taken out of the page before its stage is torn down) keeps the last real viewport and the view, instead of fitting to a 0 × 0 box and firing viewport, zoom and camera events. Shown again at its size, the stage carries on where it was.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A viewport report of the size the stage already has is now a no-op. It used to count as a resize: it cancelled a navigation still animating and re-applied the old anchor, so a `reveal()` asked for as the view opened (before the ResizeObserver's first callback repeated the size) kept its zoom but never moved.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The main stage lens registers `goto` and `named` action executors with the action engine when present: GoTo destinations reveal through the camera, NextPage/PrevPage/FirstPage/LastPage execute, unknown named verbs report inert.

  The stage lens also reports placed/current/visible page state and user-versus-programmatic motion causes to the action lifecycle coordinator.

  Publish a bundle-safe `/contract` entry and a focused `/destination` helper entry so camera consumers do not pull in stage reducer/effect/plugin wiring.

## 3.0.0-next.10

### Patch Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Allow `RevealOptions.rect` to be `null` and align stage coordinate conversion
  with the content-space page transform API.

## 3.0.0-next.9

## 3.0.0-next.8

### Patch Changes

- [#779](https://github.com/embedpdf/embed-pdf-viewer/pull/779) by [@bobsingor](https://github.com/bobsingor) – Keep page and scrollbar screen geometry hidden until initial viewport placement commits. Stage consumers no longer receive origin-based placeholder geometry while viewport, responsive settings, and camera state are being initialized, preventing pages from rendering at the top-left before their final placement.

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add responsive container-query settings and named active rules. Add gesture lifecycle, elastic overscroll, fling, anchored double-tap zoom, and lens identity APIs, while removing the deprecated interaction settings and moving wheel classification to `@embedpdf/web`.

### Patch Changes

- [#777](https://github.com/embedpdf/embed-pdf-viewer/pull/777) by [@bobsingor](https://github.com/bobsingor) – Double-tap from a pinched-in zoom returns to fit-width instead of climbing (the iOS rule). The zoom ladder previously picked "the first posture meaningfully above the current zoom," so a pinch to a level between fit-width and detail made a double-tap zoom IN further. The rule is now: the ladder ascends only from ON a rung (within ±10% of a posture) — a tap at a posture moves to the next, wrapping past the top — while a pinch to any other level is leaving the ladder, and a double-tap there RESETS to the base fit ("take me back to reading"), never a further zoom-in. Everything that already felt right is unchanged: zoomed-out → fit-width, fit-width → detail, detail → fit-width.

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Expose transient `cameraResting` state and defer page-origin device snapping while zoom is moving. Pages retain fractional placement through continuous zoom and snap once the camera settles, preventing anchor jitter and per-step content movement without sacrificing crisp resting placement.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt document stage plugin. It combines scrolling, viewport measurement, zoom, pan, spread layouts, navigation, and coordinate conversion through pure intents and selectors built on `@embedpdf/core-stage`.
