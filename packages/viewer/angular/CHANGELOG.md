# @embedpdf/viewer-angular

## 3.1.0

### Minor Changes

- [#1027](https://github.com/embedpdf/embed-pdf-viewer/pull/1027) by [@bobsingor](https://github.com/bobsingor) – The viewer takes a `features` input, which it follows while it runs: what people can do, a feature or a
  part on or off (`[features]="{ measurement: true }"`). Measuring, redaction, building forms and snapshots now start off until
  `features` turns them on. `disable` is deprecated and goes in 4.0.

## 3.0.0

### Minor Changes

- [#948](https://github.com/embedpdf/embed-pdf-viewer/pull/948) by [@bobsingor](https://github.com/bobsingor) – `<epdf-pdf-viewer>` has an `appState` input, your app's state, which your commands read; it follows its input, and the commands' buttons with it.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – `<epdf-pdf-viewer [fetch]>`: your own `fetch` for documents at a URL, to add headers or cookies. It follows its input, like `src`.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – `EpdfButton` and `EpdfMenuItem` take `active`: shown pressed, or checked, as a command's button or row is while its command is active, for a toggle of your own (a theme switch). `EpdfIcon` draws one of the viewer's icons, or one of yours (`icons`), in the color of the text around it: `name`, `size` (default 20) and `label` for screen readers. `size`, `touch` and `warnBeforeLeaving` are inputs (read once). Inside the viewer, `inject()` finds every plugin's service, now with `EpdfMetadata`, `EpdfOutline`, `EpdfAttachment` and `EpdfFonts`: the list is keyed by the viewer's plugin names, so the compiler catches one left out.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Angular wrapper for the full viewer. `<epdf-pdf-viewer>` (`EpdfPdfViewer`, a standalone component) renders the `<embedpdf-viewer>` element with every config key as an input, or the whole config with `[config]` (an input given wins over its key there), and the callbacks as outputs: `(ready)`, `(documentChange)` and `(panelResize)`. `src`, `theme`, `locale`, `disable` and `readOnly` follow their inputs on the running viewer, compared by value; any other key is read once, and a change warns once in development (a new `@if` branch mounts a new viewer). `class` and `style` go on `<epdf-pdf-viewer>`, a block the viewer fills.

  `<ng-template epdfToolbarItem="id">`, `epdfPanel` and `epdfRegion` put your components in the viewer once it's ready, where they stay in your app: your injectors, your state and your CSS. Inside a toolbar item, `inject(EpdfToolbarItemContext)` gives `orientation()`, `edge()`, `variant()` and `size()` as signals, following the bar it sits in. `EpdfButton`, `EpdfMenu` and `EpdfMenuItem` let your templates use the viewer's `<epdf-button>`, `<epdf-menu>` and `<epdf-menu-item>` (`(select)`) without `CUSTOM_ELEMENTS_SCHEMA`. Inside the viewer, `inject(EpdfPdfViewerRef)` gives the `viewer` and the element as signals, the `epdfCommand` directive and `inject(EpdfCommands).commandOf(id)` give a command, and every service of `@embedpdf/angular` (`inject(EpdfSearch)`, …) works against the viewer's own kernel, `inject(EpdfStageRef)` against its pages' Stage; around it, `viewChild(EpdfPdfViewerRef)` gives the same. The main entry brings the built-in engine; `@embedpdf/viewer-angular/core` takes your own (`[engine]` is required there) and leaves PDFium out of the build. Both are safe to import and render on the server (Angular SSR), where the component renders the empty element.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `documents` is an input of each door's `<epdf-pdf-viewer>`, typed by that door like `src`: entries of `{ src, name, password, active }`. `EpdfPdfViewerBase` no longer declares it, so a door of its own (such as CloudPDF's) names its documents in its own words.

### Patch Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – `fonts` as an input of `<epdf-pdf-viewer>`.

## 3.0.0-next.23

## 3.0.0-next.22

## 3.0.0-next.21

## 3.0.0-next.20

### Minor Changes

- [#948](https://github.com/embedpdf/embed-pdf-viewer/pull/948) by [@bobsingor](https://github.com/bobsingor) – `<epdf-pdf-viewer>` has an `appState` input, your app's state, which your commands read; it follows its input, and the commands' buttons with it.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – `EpdfButton` and `EpdfMenuItem` take `active`: shown pressed, or checked, as a command's button or row is while its command is active, for a toggle of your own (a theme switch). `EpdfIcon` draws one of the viewer's icons, or one of yours (`icons`), in the color of the text around it: `name`, `size` (default 20) and `label` for screen readers. `size`, `touch` and `warnBeforeLeaving` are inputs (read once). Inside the viewer, `inject()` finds every plugin's service, now with `EpdfMetadata`, `EpdfOutline`, `EpdfAttachment` and `EpdfFonts`: the list is keyed by the viewer's plugin names, so the compiler catches one left out.

### Patch Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – `fonts` as an input of `<epdf-pdf-viewer>`.

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
