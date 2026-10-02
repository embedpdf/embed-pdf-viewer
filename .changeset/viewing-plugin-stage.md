---
'@embedpdf/plugin-stage': minor
---

The Stage's state is declared once as `stageState` (`zoomLevel`, `zoomMode`, `currentPageIndex`, `currentPage`, `pageCount`, `viewRotation`, `activeRules`), which each framework turns into its state hook. New `getPageCount()`. `getCurrentPage()` and `onPageChanged`'s `page` are the page's `PageRef` (was its `PageInfo`). `isPageVisible`, `getPageFrame`, `viewportToPage`, `pageToViewport` and `pageRectToViewport` take a page's ref or its index, and read a page that isn't in the document as `null`/`false`.

Settings change only through `updateSettings()`: `setFlow`, `setLayout`, `setSpread` and `setSizing` are gone. How a view takes pointer input is now its own settings, `interaction`, `panFallback` and `zoomGestures` (all `true` by default), so a thumbnail strip registers `stagePlugin({ token, interaction: false, zoomGestures: false })` and can change them while the app runs. A `pageFrame` may name only the sides it reserves (`{ bottom: 20 }`); the others are 0. `getSettings()` returns the same object until a setting changes. GoTo and Named page actions now move the view by its `scrollBehavior` setting instead of always gliding.
