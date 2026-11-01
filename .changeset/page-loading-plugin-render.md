---
'@embedpdf/plugin-render': minor
---

Show that a page is loading: `render.getPictureState(page, view)` says whether a picture of the page is on screen in a view, as `{ status, slow }`. `status` is `'loading'` from the moment a layer paints the page until its first picture is on screen, then `'ready'`; `'forbidden'` without `doc.render`, `'error'` when it couldn't be drawn, and `'idle'` in a view that doesn't show the page. Tiles arriving as the view zooms and a redraw after a change keep the page `'ready'`. `slow` turns on once a page has waited `slowAfterMs` (a new setting, 400 by default), the moment to show an indicator, so a page that shows quickly never flashes one. `onPictureStateChanged` fires on every change. Whatever paints a page reports it: the layers through `reportPicture(view, page)` on the host lens, and a plugin painting the pictures through the `report` its `paint(host, page, report)` now gets (`report.shown()`, `report.failed(error)`).
