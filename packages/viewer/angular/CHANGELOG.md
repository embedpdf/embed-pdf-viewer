# @embedpdf/viewer-angular

## 3.0.0-next.20

## 3.0.0-next.19

### Minor Changes

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – `<epdf-pdf-viewer [fetch]>`: your own `fetch` for documents at a URL, to add headers or cookies. It follows its input, like `src`.

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Angular wrapper for the full viewer. `<epdf-pdf-viewer>` (`EpdfPdfViewer`, a standalone component) renders the `<embedpdf-viewer>` element with every config key as an input, or the whole config with `[config]` (an input given wins over its key there), and the callbacks as outputs: `(ready)`, `(documentChange)` and `(panelResize)`. `src`, `theme`, `locale`, `disable` and `readOnly` follow their inputs on the running viewer, compared by value; any other key is read once, and a change warns once in development (a new `@if` branch mounts a new viewer). `class` and `style` go on `<epdf-pdf-viewer>`, a block the viewer fills.

  `<ng-template epdfToolbarItem="id">`, `epdfPanel` and `epdfRegion` put your components in the viewer once it's ready, where they stay in your app: your injectors, your state and your CSS. Inside a toolbar item, `inject(EpdfToolbarItemContext)` gives `orientation()`, `edge()`, `variant()` and `size()` as signals, following the bar it sits in. `EpdfButton`, `EpdfMenu` and `EpdfMenuItem` let your templates use the viewer's `<epdf-button>`, `<epdf-menu>` and `<epdf-menu-item>` (`(select)`) without `CUSTOM_ELEMENTS_SCHEMA`. Inside the viewer, `inject(EpdfPdfViewerRef)` gives the `viewer` and the element as signals, the `epdfCommand` directive and `inject(EpdfCommands).commandOf(id)` give a command, and every service of `@embedpdf/angular` (`inject(EpdfSearch)`, …) works against the viewer's own kernel, `inject(EpdfStageRef)` against its pages' Stage; around it, `viewChild(EpdfPdfViewerRef)` gives the same. The main entry brings the built-in engine; `@embedpdf/viewer-angular/core` takes your own (`[engine]` is required there) and leaves PDFium out of the build. Both are safe to import and render on the server (Angular SSR), where the component renders the empty element.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `documents` is an input of each door's `<epdf-pdf-viewer>`, typed by that door like `src`: entries of `{ src, name, password, active }`. `EpdfPdfViewerBase` no longer declares it, so a door of its own (such as CloudPDF's) names its documents in its own words.
