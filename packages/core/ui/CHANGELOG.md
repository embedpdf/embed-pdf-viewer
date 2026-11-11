# @embedpdf/core-ui

## 3.2.0

## 3.1.0

### Minor Changes

- [#1029](https://github.com/embedpdf/embed-pdf-viewer/pull/1029) by [@bobsingor](https://github.com/bobsingor) – `omittedCommandsOf(data, resolve, menuTarget)` takes which menu each button opens as its own
  argument, as `layoutToolbar` does (the commands' `getMenuTarget`, or `getCommand`), so `resolve` is
  asked only whether a command shows, and only for the commands that decide it. Without
  `menuTarget`, `resolve` says which menu a button opens, as before.

## 3.0.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the framework-free core for full-viewer chrome. It defines structural UI schemas, toolbar measurement and overflow solving, menu projection, and keyboard shortcut parsing without owning rendered components.

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `group(id, items, options?)` and `custom(slot, terminal, options?)` take their items and their menu command first, the options last. `formatShortcut()` shows named keys as each platform does: `→` for ArrowRight, `⌦` for Delete on a Mac, `Esc`, `Num +`.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `treeKeyAction(rows, focused, key, options)` is the keyboard of a tree view, as the ARIA tree pattern has it: the arrows, Home and End, `*`, Enter, and F2 and Delete when the tree is editable. Pure: a view hands in its rows and the key, and does what comes back.

- [#999](https://github.com/embedpdf/embed-pdf-viewer/pull/999) by [@bobsingor](https://github.com/bobsingor) – `resolveLayout(option, defaults, env)` takes `option: LayoutOption | undefined`, no `null`.

- [#957](https://github.com/embedpdf/embed-pdf-viewer/pull/957) by [@bobsingor](https://github.com/bobsingor) – A floating bar's place takes `hideWhenIdle` (`FloatPlace`) in place of `hideWhileScrolling`, and `hideWhenIdleOf(data, id)` reads it in place of `hideWhileScrollingOf`, through the bar it rides along: the bar rests out of sight while nothing moves, instead of hiding while the pages scroll.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – A bar can go at the top of a panel, under its title: the place `{ panel: id }`, beside an edge, `{ float }`, `{ with }` and `{ at }`. A panel's bars stack in the order they were added. `barsInPanel(data, panel)` lists them and `panelOf(place)` reads the panel a place names, and `validateLayout()` names a panel the layout doesn't have, with the closest one that exists.

- [#980](https://github.com/embedpdf/embed-pdf-viewer/pull/980) by [@bobsingor](https://github.com/bobsingor) – A bar can sit by the snapshot tool's box: `{ at: 'snapshot' }`, beside `{ at: 'selection' }` and `{ at: 'annotation' }`.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – `CustomSlotContext` replaces `CustomSlotCtx`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Add the viewer's layout: bars with a `place` (an edge with `before`/`after`, `{ float }`, `{ with }`, `{ at: 'selection' | 'annotation' }`), a `mode` and a `title`, menus with titled sections, panels and `tabs`, all as plain data. `createLayout(data)` makes the immutable layout whose chainable edits (`place`, `addBar`, `removeBar`, `add`, `remove`, `replace`, `addMenu`, `addPanel`, `panel`, `removePanel`, `tabs`) each return a new one, `toJSON()` gives the data back, and `resolveLayout(option, defaults, env)` runs a `(layout, env) => layout` function. `compileBar` turns a layout bar into the `BarSchema` a toolbar fits, with the mode tabs derived from the bars' modes; `validateLayout` names every unknown id with the closest one that exists. A custom item without a command never leaves its bar; its normalized `terminal` is `null`, and `commandOfUnit(unit)` gives the command a unit runs, or `null` for such an item. `ChromeSchema`, `FrameSchema`, `MenuSchema`, `chromeHelpers`, `defineChrome`, `validateChrome`, `addItem`, `removeItems` and `replaceItem` are removed.

  The toolbar fit runs along either axis: it counts lengths, widths for a horizontal bar and heights for a vertical one. `solve(bar, metrics, containerLength)`, `FitResult.length` and `ToolbarLayoutInput.containerLength` replace their `width` names, and a custom item's `measure(length)` reports its length along the bar. `layoutToolbar({ orientation: 'vertical' })` draws and measures every command of a vertical bar at `'icon'` only, with no smaller step; custom items keep their own variants.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – Layout:
  - `panel(id, changes)` takes `title` (the same in every language), `open` (open when a document opens, where the panel docks) and `closable: false` (no close button where it docks; another panel on its side can take its place, and it comes back when that one closes). A `title` takes out a `titleKey` and a `titleKey` a `title`. `resizable`, `open` and `closable` must be booleans.
  - `removeBar()` takes one id or a list, and takes out every bar that rides along a removed one, and theirs.
  - A floating bar's place takes `hideWhileScrolling` (`FloatPlace`), and `hideWhileScrollingOf(data, id)` reads it, through the bar it rides along.
  - Item options: `grow: true` on your own component takes the room the bar has left, and `emphasis: 'primary'` (`Emphasis`) on a command's button makes it the bar's main button. Both are checked: `grow` only on a custom item, `emphasis` only on a command.
  - The toolbar layout fits an item that grows at its own length, then grows it and its section into the rest: each section of the live row says whether it `grows`, and its `spacing` (`SectionSpacing`: `'balance'` centers it in the room the others leave, `'gap'` keeps the toolbar's gap before it, `'none'`).

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – `OverflowRow` is tagged `kind`, as things that are are.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Reads for the bars that float over the pages: `floatOf(place)` gives where a place floats, `barsFloating(data, position)` lists the bars floating at a position in the order they were added, `floatStackOf(data, position)` lists them each followed by the bars that ride along it (as `edgeStackOf` does for an edge), and `FLOAT_POSITIONS` names the eight positions. `tabsOf(data)` says when the document tabs show: the layout's `tabs`, or `'multiple'` (while more than one document is open) when it has none.

  A group can be `dependent: true` (on a layout group object, on `BarGroup`, and normalized on `NormalizedGroup`): it shows only while something that isn't dependent shows in the same bar. A bar with only dependent groups left shows nothing, so `filterBar`, `hasVisibleUnits`, `projectStrip` and the toolbars built on them draw nothing for it, and `omittedCommandsOf` leaves out the tab of a mode whose bars have only dependent groups left. Menus are not affected. `validateLayout` names a `dependent` that isn't `true` or `false`, and a bar whose every group is dependent.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A panel's `present` takes a way to open for each of the viewer's sizes (`PanelPresentationBySize`: `{ compact: 'overlay' }`), and the sizes it leaves out open the default way. `width` takes where it starts and how far it drags (`PanelWidth`: `{ initial, min, max }`), a number being where it starts, and `resizable: false` says its edge doesn't drag. `layout.panels(changes)` changes every panel the layout has, as `layout.panel(id, changes)` changes one, and both change only what `present` and `width` name: a map of sizes keeps the other sizes, and a number or `{ initial }` keeps the limits. `panelPresentationsOf` and `panelWidthFieldsOf` read the two fields' short forms. `validateLayout` names a size or a width field that isn't one, a `min` wider than the `max`, and a `resizable` that isn't true or false.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `sameShortcut(left, right, { isMac })` says whether two shortcuts are pressed with the same keys on this platform: `'Mod+S'` and `'Ctrl+s'` are, where `Mod` is Ctrl.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add what a toolbar draws, as data, so every framework adapter shares one implementation: `layoutToolbar(input)` fits a bar and turns the fit into the parts to draw (the live row's sections and groups, the measurement layer's every variant, folded group and group trigger, each with its command resolved, its run bound and the key its width is measured under); `groupMenuView(view, isOpen, close)` is the menu a folded group or a group's trigger opens; `stripGroupsOf(bar, resolve)` and `sameStripGroups(left, right, sameCommand)` resolve and compare a strip. The views (`CollapsedGroupView`, `GroupDisclosureView`, `OverflowMenuView`, `StripView`, `StripViewGroup`, `CustomSlotCtx`) are generic over the resolved command.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – An item without its own `importance` has its group's, as the docs say, instead of `3`. `group('annotate', items, { importance: 2 })` now moves those items into the "More" menu before the rest of the bar, and every item of a group at `5` stays in the bar. An item's own `importance` still wins, and a custom item without a command is still pinned.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A shortcut on a letter no longer matches the letter typed with Shift unless it says `Shift`: `Mod+Z` and `Shift+Mod+Z` are two shortcuts.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update UI schema, projection, shortcut, and layout helpers to work with the
  revised plugin state and command contracts.

## 3.0.0-next.23

### Minor Changes

- [#999](https://github.com/embedpdf/embed-pdf-viewer/pull/999) by [@bobsingor](https://github.com/bobsingor) – `resolveLayout(option, defaults, env)` takes `option: LayoutOption | undefined`, no `null`.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – `CustomSlotContext` replaces `CustomSlotCtx`.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – `OverflowRow` is tagged `kind`, as things that are are.

## 3.0.0-next.22

### Minor Changes

- [#980](https://github.com/embedpdf/embed-pdf-viewer/pull/980) by [@bobsingor](https://github.com/bobsingor) – A bar can sit by the snapshot tool's box: `{ at: 'snapshot' }`, beside `{ at: 'selection' }` and `{ at: 'annotation' }`.

## 3.0.0-next.21

### Minor Changes

- [#957](https://github.com/embedpdf/embed-pdf-viewer/pull/957) by [@bobsingor](https://github.com/bobsingor) – A floating bar's place takes `hideWhenIdle` (`FloatPlace`) in place of `hideWhileScrolling`, and `hideWhenIdleOf(data, id)` reads it in place of `hideWhileScrollingOf`, through the bar it rides along: the bar rests out of sight while nothing moves, instead of hiding while the pages scroll.

## 3.0.0-next.20

### Minor Changes

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – Layout:
  - `panel(id, changes)` takes `title` (the same in every language), `open` (open when a document opens, where the panel docks) and `closable: false` (no close button where it docks; another panel on its side can take its place, and it comes back when that one closes). A `title` takes out a `titleKey` and a `titleKey` a `title`. `resizable`, `open` and `closable` must be booleans.
  - `removeBar()` takes one id or a list, and takes out every bar that rides along a removed one, and theirs.
  - A floating bar's place takes `hideWhileScrolling` (`FloatPlace`), and `hideWhileScrollingOf(data, id)` reads it, through the bar it rides along.
  - Item options: `grow: true` on your own component takes the room the bar has left, and `emphasis: 'primary'` (`Emphasis`) on a command's button makes it the bar's main button. Both are checked: `grow` only on a custom item, `emphasis` only on a command.
  - The toolbar layout fits an item that grows at its own length, then grows it and its section into the rest: each section of the live row says whether it `grows`, and its `spacing` (`SectionSpacing`: `'balance'` centers it in the room the others leave, `'gap'` keeps the toolbar's gap before it, `'none'`).

## 3.0.0-next.19

### Minor Changes

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – A bar can go at the top of a panel, under its title: the place `{ panel: id }`, beside an edge, `{ float }`, `{ with }` and `{ at }`. A panel's bars stack in the order they were added. `barsInPanel(data, panel)` lists them and `panelOf(place)` reads the panel a place names, and `validateLayout()` names a panel the layout doesn't have, with the closest one that exists.

### Patch Changes

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – An item without its own `importance` has its group's, as the docs say, instead of `3`. `group('annotate', items, { importance: 2 })` now moves those items into the "More" menu before the rest of the bar, and every item of a group at `5` stays in the bar. An item's own `importance` still wins, and a custom item without a command is still pinned.

## 3.0.0-next.18

## 3.0.0-next.17

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
