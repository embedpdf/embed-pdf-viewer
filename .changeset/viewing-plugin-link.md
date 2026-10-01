---
'@embedpdf/plugin-link': minor
---

`activate()` now opens a website itself, in the user's gesture, through the opener a framework binding registers on the host lens (`registerUriOpener`); an address it won't open (`javascript:`, `file:`) activates as `reported`. A page destination moves the view the link was followed in (`activate(link, { stage })`), by that view's `scrollBehavior` setting instead of always gliding.

`listLinks`, `getLink`, `getLinkAt`, `ensureLoaded`, `isLoaded`, `getStatus` and `activateAt` take a page's ref or its index; a read of a page that isn't in the document is empty, and `ensureLoaded`/`activateAt` refuse it with `not-found`. `ensureLoaded` and `listAllLinks` reject `operation-cancelled` when their `signal` fires.
