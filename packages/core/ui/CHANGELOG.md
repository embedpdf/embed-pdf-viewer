# @embedpdf/core-ui

## 3.0.0-next.16

### Minor Changes

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `treeKeyAction(rows, focused, key, options)` is the keyboard of a tree view, as the ARIA tree pattern has it: the arrows, Home and End, `*`, Enter, and F2 and Delete when the tree is editable. Pure: a view hands in its rows and the key, and does what comes back.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `group(id, items, options?)` and `custom(slot, terminal, options?)` take their items and their menu command first, the options last. `formatShortcut()` shows named keys as each platform does: `→` for ArrowRight, `⌦` for Delete on a Mac, `Esc`, `Num +`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Add the viewer's layout: bars with a `place` (an edge with `before`/`after`, `{ float }`, `{ with }`, `{ at: 'selection' | 'annotation' }`), a `mode` and a `title`, menus with titled sections, panels and `tabs`, all as plain data. `createLayout(data)` makes the immutable layout whose chainable edits (`place`, `addBar`, `removeBar`, `add`, `remove`, `replace`, `addMenu`, `addPanel`, `panel`, `removePanel`, `tabs`) each return a new one, `toJSON()` gives the data back, and `resolveLayout(option, defaults, env)` runs a `(layout, env) => layout` function. `compileBar` turns a layout bar into the `BarSchema` a toolbar fits, with the mode tabs derived from the bars' modes; `validateLayout` names every unknown id with the closest one that exists. A custom item without a command never leaves its bar; its normalized `terminal` is `null`, and `commandOfUnit(unit)` gives the command a unit runs, or `null` for such an item. `ChromeSchema`, `FrameSchema`, `MenuSchema`, `chromeHelpers`, `defineChrome`, `validateChrome`, `addItem`, `removeItems` and `replaceItem` are removed.

  The toolbar fit runs along either axis: it counts lengths, widths for a horizontal bar and heights for a vertical one. `solve(bar, metrics, containerLength)`, `FitResult.length` and `ToolbarLayoutInput.containerLength` replace their `width` names, and a custom item's `measure(length)` reports its length along the bar. `layoutToolbar({ orientation: 'vertical' })` draws and measures every command of a vertical bar at `'icon'` only, with no smaller step; custom items keep their own variants.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Reads for the bars that float over the pages: `floatOf(place)` gives where a place floats, `barsFloating(data, position)` lists the bars floating at a position in the order they were added, `floatStackOf(data, position)` lists them each followed by the bars that ride along it (as `edgeStackOf` does for an edge), and `FLOAT_POSITIONS` names the eight positions. `tabsOf(data)` says when the document tabs show: the layout's `tabs`, or `'multiple'` (while more than one document is open) when it has none.

  A group can be `dependent: true` (on a layout group object, on `BarGroup`, and normalized on `NormalizedGroup`): it shows only while something that isn't dependent shows in the same bar. A bar with only dependent groups left shows nothing, so `filterBar`, `hasVisibleUnits`, `projectStrip` and the toolbars built on them draw nothing for it, and `omittedCommandsOf` leaves out the tab of a mode whose bars have only dependent groups left. Menus are not affected. `validateLayout` names a `dependent` that isn't `true` or `false`, and a bar whose every group is dependent.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A panel's `present` takes a way to open for each of the viewer's sizes (`PanelPresentationBySize`: `{ compact: 'overlay' }`), and the sizes it leaves out open the default way. `width` takes where it starts and how far it drags (`PanelWidth`: `{ initial, min, max }`), a number being where it starts, and `resizable: false` says its edge doesn't drag. `layout.panels(changes)` changes every panel the layout has, as `layout.panel(id, changes)` changes one, and both change only what `present` and `width` name: a map of sizes keeps the other sizes, and a number or `{ initial }` keeps the limits. `panelPresentationsOf` and `panelWidthFieldsOf` read the two fields' short forms. `validateLayout` names a size or a width field that isn't one, a `min` wider than the `max`, and a `resizable` that isn't true or false.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `sameShortcut(left, right, { isMac })` says whether two shortcuts are pressed with the same keys on this platform: `'Mod+S'` and `'Ctrl+s'` are, where `Mod` is Ctrl.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add what a toolbar draws, as data, so every framework adapter shares one implementation: `layoutToolbar(input)` fits a bar and turns the fit into the parts to draw (the live row's sections and groups, the measurement layer's every variant, folded group and group trigger, each with its command resolved, its run bound and the key its width is measured under); `groupMenuView(view, isOpen, close)` is the menu a folded group or a group's trigger opens; `stripGroupsOf(bar, resolve)` and `sameStripGroups(left, right, sameCommand)` resolve and compare a strip. The views (`CollapsedGroupView`, `GroupDisclosureView`, `OverflowMenuView`, `StripView`, `StripViewGroup`, `CustomSlotCtx`) are generic over the resolved command.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A shortcut on a letter no longer matches the letter typed with Shift unless it says `Shift`: `Mod+Z` and `Shift+Mod+Z` are two shortcuts.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update UI schema, projection, shortcut, and layout helpers to work with the
  revised plugin state and command contracts.

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the framework-free core for full-viewer chrome. It defines structural UI schemas, toolbar measurement and overflow solving, menu projection, and keyboard shortcut parsing without owning rendered components.
