# @embedpdf/viewer-react

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer>` takes `onDocumentChange(documentId)` (the React face of the element's `epdf:documentchange` event) and warns once in development when a config prop changes after mount — config is init-only, like `<Viewer>`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/viewer-react/component` is the wrapper's door-blind parts (`<PDFViewer>` at the widest config, the slots, components and hooks), so a door in another package, such as `@cloudpdf/viewer-react`, narrows the same component to its own config. The `.` door's `<PDFViewer>` is narrowed to its `ViewerConfig` too, as the `./core` door's was: its props were the kernel's widest config.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The children of `<PDFViewer>` mount once the viewer is ready, inside its kernel, so the headless hooks of `@embedpdf/react` (`useSearch()`, `useSearchState()`, …) work in your own components in the viewer. Install `@embedpdf/react` at the same version as the viewer.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer>` hands changes of `src`, `theme`, `locale`, `disable` and `readOnly` to the running viewer, which changes them in place: `src={file}` from a file input opens the picked file in place of the last one. Every other prop is still read once; the development warning now names only those. `onReady` gets the `Viewer` (`viewer.get('search')`, `viewer.documents`, `viewer.commands`), and the package exports the `Viewer` and `ViewerConfig` types.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `ToolbarItem`, `Panel` and `Region` put your React component in the viewer (`<ToolbarItem id="versions">` fills `{ custom: 'versions' }`), where it stays in your React tree. `useToolbarItem()` tells a component in a `ToolbarItem` where it sits: `orientation`, `edge`, `variant` and `size`, live. `Button`, `Menu` and `MenuItem` are the viewer's own components (`<Button command="zoom:in" />`, `<MenuItem onSelect>`). All of them come from both entries.

  `usePDFViewer()` gives a component inside `<PDFViewer>` the `viewer`, and `useCommand(id)`, `@embedpdf/react`'s own, a command as a button needs it (`label`, `icon`, `shortcut`, `enabled`, `active`, `visible`, `run()`), following it live; an id the viewer doesn't have is neither visible nor enabled. When the viewer goes, the children unmount with it and mount again inside the next one. `onPanelResize`, like `onReady` and `onDocumentChange`, calls the latest prop. Both entries are marked `'use client'` and are safe to import on the server, where `<PDFViewer>` renders the empty element. `className` now reaches the element as its `class`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer>` marks the element it renders `data-epdf-wrapped`, so after server rendering the viewer starts once, with the props, when hydration sets them, never first from the element's attributes.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Align the React viewer component and exports with the updated viewer kernel
  and plugin configuration.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `onReady` and `onDocumentChange` are config keys of `ViewerConfig`, which `<PDFViewer>` passes to the viewer. They keep calling the latest prop, so an inline callback is no change.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the React wrapper for the complete EmbedPDF viewer. `<PDFViewer>` configures the custom element while React children remain in the application's React tree and project into named viewer slots.
