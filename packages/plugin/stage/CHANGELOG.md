# @embedpdf/plugin-stage

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
