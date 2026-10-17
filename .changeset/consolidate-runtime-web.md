---
'@embedpdf/web': patch
---

Add what every framework's page surfaces share:

- `makePageContext`, `livePageContext`, `pageClientSpace` and the `PageContext` type: the page context a Stage page or a page view hands its layers, and its client-space conversions.
- `pageSurfaceLayout(transform, frame, footprint?)`: a page surface's outer, shadow and turned content boxes. `stagePageDemand(stage, page, deviceWidth)`: what a Stage page's view wants rendered. `pageViewTransformInput(page, width, dpr)`: a page view's transform input, with 100% at 96/72 CSS pixels per point times the page's /UserUnit.
- `stageViewProjector(() => stage)`: the Stage's projector for anchored UI. `clientPageProjector` also takes a page whose `transform` is a function (a signal).
- `attachPagePointer(element, hub, page)` and `createClickCounter()`: a page's pointer listener for the interaction plugin.
- `scrollbarLayout(...)` and `createScrollbarPresses(onDragging)`: a Stage scrollbar's thumb geometry, drags, and track paging.
- `toolCursorsOf(cursors)` with the `ToolCursorImage` and `ToolCursorSpec` types: a tool's cursors as CSS cursor values.
- `anchoredViewOf`, `sameAnchoredFit` and `observeAnchoredFit`: measuring anchored UI and the area it stays inside.
