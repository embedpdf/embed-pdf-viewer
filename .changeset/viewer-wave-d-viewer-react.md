---
'@embedpdf/viewer-react': minor
---

`ToolbarItem`, `Panel` and `Region` put your React component in the viewer (`<ToolbarItem id="versions">` fills `{ custom: 'versions' }`), where it stays in your React tree. `useToolbarItem()` tells a component in a `ToolbarItem` where it sits: `orientation`, `edge`, `variant` and `size`, live. `Button`, `Menu` and `MenuItem` are the viewer's own components (`<Button command="zoom:in" />`, `<MenuItem onSelect>`). All of them come from both entries.

`usePDFViewer()` gives a component inside `<PDFViewer>` the `viewer`, and `useCommand(id)`, `@embedpdf/react`'s own, a command as a button needs it (`label`, `icon`, `shortcut`, `enabled`, `active`, `visible`, `run()`), following it live; an id the viewer doesn't have is neither visible nor enabled. When the viewer goes, the children unmount with it and mount again inside the next one. `onPanelResize`, like `onReady` and `onDocumentChange`, calls the latest prop. Both entries are marked `'use client'` and are safe to import on the server, where `<PDFViewer>` renders the empty element. `className` now reaches the element as its `class`.
