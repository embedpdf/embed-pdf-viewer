---
'@embedpdf/plugin-stage': minor
---

The stage capability follows the contract dictionary, split into a public contract (`/contract`) and a host lens (`/contract/host`).

Reads: `getCamera`, `getViewpoint`, `getViewportSize`, `getZoomLevel`, `getZoomMode`, `getViewRotation`, `getSettings` (the one place for `flow`/`layout`/`spread`/`sizing`/`bounded`/`pageFrame`/…), `getViewState`, `getCurrentPage`, `getCurrentPageIndex`, `listCurrentItemPages`, `listVisiblePages`, `isPageVisible`, `getPageFrame`, `getPageAt`, `listActiveRules`, `matchesRule`, `isMoving`, `canGoNext`, `canGoPrevious`. Writes: `zoomIn`/`zoomOut`/`zoomTo`/`zoomBy`, `fitWidth`/`fitPage`/`fitAll`/`fitAutomatic`, `goToPage(ref)`/`goToPageIndex`/`goToFirstPage`/`goToLastPage`/`nextPage`/`previousPage`, `reveal(ref)`/`revealIndex`/`revealRect`, `scrollTo`/`scrollBy`/`panBy`/`setCamera`/`stopMotion`, `setViewRotation`/`rotateViewBy`, `setFlow`/`setLayout`/`setSpread`/`setSizing`/`updateSettings`/`resetSettings`/`resetView`/`applyViewState`, `setResponsiveRules`. Coordinates are page space ⇄ viewport: `pageToViewport`, `viewportToPage`, `pageRectToViewport`. Events: `onPageChanged`, `onZoomChanged`, `onCameraChanged`, `onMotionEnded`, `onSettingsChanged`, `onViewportChanged`.

Host (`StageHostCapability`, same runtime token): `setViewportSize`, `setDevicePixelRatio`, `beginGesture`/`endGesture`, `fling`, `doubleTapZoom`, `zoomAround`, `getScrollMetrics`, `worldToViewport`/`viewportToWorld`/`pageToWorld`, `provideInitialView`, `placeInitial`, `refit`, `getLensId`.

Removed: the per-setting getters, `pages()` and `pageCount()` (the page list is document truth: `documents.listPages`), `visiblePages`, `currentPage`, `currentItemPages`, `pageRect`, `pageAt`, `pointOnPage`, `pageRectToScreen`, `toScreen`/`toWorld`, `setViewport`, `cameraInMotion`, `automatic`, `next`/`prev`, index-taking `goToPage`/`reveal`, `lensId`, `update`, `setResponsive`, `matches`, `activeRules`.

- Internal layout: `contract` / `host-contract` / `model` / `controller` with `services`, `read`, `camera`, `navigation`, `settings`, `view` and `sync` areas; the plugin is defined on `create()`.
- `StageState` / `StageAction` are host-lens types now (`@embedpdf/plugin-stage/contract/host`), no longer exported from `/contract` or the package root.
