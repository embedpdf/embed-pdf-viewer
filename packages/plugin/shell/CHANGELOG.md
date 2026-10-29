# @embedpdf/plugin-shell

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `ShellState`, what `shellState` reads and `useShellState()` returns, the State table of the panels page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `ShellModel`, made by `initialShellModel()`, so `ShellState` has one meaning.

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The shell's surface and menu changes are named state transitions and its events are derived from them. The `/internal` entry is removed, and `ShellState` and `ShellAction` are no longer exported.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The shell plugin now follows the 3.0 public contract: `getSurface(id)` (folds in `surfaceProps`), `listOpenSurfaces` (was `openSurfaces`), `listOpenMenus` (was `openMenus`), `updateSurfaceProps`, `closeAll`, `getSnapshot` / `applySnapshot`, and the event hooks `onSurfaceOpened` / `onSurfaceClosed` / `onMenuOpened` / `onMenuClosed`. The package gains a `./contract/host` entry.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `shellState` declares the shell's state for every framework: `openSurfaces` and `openMenus`, both empty without a document. Each event has its own payload: `onSurfaceOpened` carries `id` and `props` (`SurfaceOpenedEvent`), and `onSurfaceClosed`, `onMenuOpened` and `onMenuClosed` carry `id` (`SurfaceClosedEvent`, `MenuOpenedEvent`, `MenuClosedEvent`); `SurfaceEvent` and `MenuEvent` are gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `open(id, { focus: true })` and `toggle(id, { focus: true })` ask for the cursor: each raises the surface's `focusRequest` by one, also when it is open already, and closing it sets the request back to 0. The element that follows the request takes focus (the framework packages' surface-focus hooks); a plain open never moves the cursor. `focusRequest` is a moment, not state to keep: `getSnapshot()` leaves it out, and `applySnapshot()` starts every surface at 0.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the shell token, surface state, options, and capability types without reducer or plugin wiring.

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces serializable workbench state for panels, modals, overlays, menus, and other named viewer surfaces. Applications retain ownership of rendered UI while commands and persistence operate on one consistent shell model.
