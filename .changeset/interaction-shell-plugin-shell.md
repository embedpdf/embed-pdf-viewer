---
'@embedpdf/plugin-shell': minor
---

`shellState` declares the shell's state for every framework: `openSurfaces` and `openMenus`, both empty without a document. Each event has its own payload: `onSurfaceOpened` carries `id` and `props` (`SurfaceOpenedEvent`), and `onSurfaceClosed`, `onMenuOpened` and `onMenuClosed` carry `id` (`SurfaceClosedEvent`, `MenuOpenedEvent`, `MenuClosedEvent`); `SurfaceEvent` and `MenuEvent` are gone.
