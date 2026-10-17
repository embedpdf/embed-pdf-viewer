---
'@embedpdf/angular': minor
---

`provideEmbedPdf({ kernel })` gives an injector a kernel someone else created and owns: every service, component and directive under it works against that kernel, and the injector neither starts nor destroys it. Its plugins are the kernel's, so a feature's services, providers and setup work while its plugins aren't registered again. The full viewer's Angular wrapper gives the templates you put in the viewer one of these.

`EpdfStageRef` in `@embedpdf/angular/stage` is the Stage's API to inject: every method of the Stage, its state as signals (`zoomLevel()`, `currentPageIndex()`, `pageCount()`, …), `settings()` and its events as streams (`pageChanged$`, …). Inside `<epdf-stage>`, `inject(EpdfStageRef)` is that Stage, with its `[token]` view and its `[document]`; anywhere else under a viewer it drives the main view of the document in scope, or of the active document, and with no document its signals read empty and its methods refuse with `not-ready`. `<epdf-stage>` extends it, so the two have the same members; from around a Stage, `#stage="epdfStage"` and `viewChild(EpdfStage)` still reach it. `withStage()` provides it.

`<epdf-toolbar>`: a custom item whose `epdfToolbarCustom` template draws nothing in the `'measure'` layer, but draws in the `'live'` one, is measured where it renders, by the length it reports with `measure`; its empty copy in the hidden measurement layer no longer reports a length that competes with it.
