---
'@embedpdf/core-ui': minor
---

A panel's `present` takes a way to open for each of the viewer's sizes (`PanelPresentationBySize`: `{ compact: 'overlay' }`), and the sizes it leaves out open the default way. `width` takes where it starts and how far it drags (`PanelWidth`: `{ initial, min, max }`), a number being where it starts, and `resizable: false` says its edge doesn't drag. `layout.panels(changes)` changes every panel the layout has, as `layout.panel(id, changes)` changes one, and both change only what `present` and `width` name: a map of sizes keeps the other sizes, and a number or `{ initial }` keeps the limits. `panelPresentationsOf` and `panelWidthFieldsOf` read the two fields' short forms. `validateLayout` names a size or a width field that isn't one, a `min` wider than the `max`, and a `resizable` that isn't true or false.
