---
'@embedpdf/web': minor
'@embedpdf/react': minor
'@embedpdf/vue': minor
---

A middle layer between the finished viewer and wiring every plugin by hand. `@embedpdf/web/controller` adds `createViewerController(kernel)`: one snapshot of what a toolbar shows (page, page count, zoom, rotation, outline rows, search, selection, undo/redo, unsaved changes; the same object until a field changes) with `subscribe()`, the common commands by name (`goToPage`, `zoomIn`, `setZoom`, `rotate`, `search`, `nextHit`, `goToOutlineItem`, `undo`, `print`, `download`, …) and a few events, all read from and sent to the installed plugins' own capabilities. `createViewer({ engine, src })` makes and owns a kernel for code without a framework, and `viewerPlugins()` is the plugin list a reading viewer uses. `@embedpdf/react/controller` and `@embedpdf/vue/controller` add `useViewerController()` and `<DocumentView>`, a Stage with the page layers a reader expects and copying wired.
