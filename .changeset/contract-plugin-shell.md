---
'@embedpdf/plugin-shell': minor
---

The shell plugin now follows the 3.0 public contract: `getSurface(id)` (folds in `surfaceProps`), `listOpenSurfaces` (was `openSurfaces`), `listOpenMenus` (was `openMenus`), `updateSurfaceProps`, `closeAll`, `getSnapshot` / `applySnapshot`, and the event hooks `onSurfaceOpened` / `onSurfaceClosed` / `onMenuOpened` / `onMenuClosed`. The package gains `./contract/host` and `./internal` entries; `ShellState` / `ShellAction` move to the host entry.
