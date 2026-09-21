---
'@embedpdf/plugin-link': minor
---

The link contract, on the kernel's `create()` hook. `Link` is the clickable area (page-space `bounds`, was `rect`) with its target and annotation. Public: `listLinks` (was `linksOn`, reference-stable per page), new `getLink`, `getLinkAt`, `listAllLinks`, `ensureLoaded` (was `ensurePage`, now a promise), `isLoaded`, `resolve` (what activation would do, no side effect), `activate` (also accepts a `Link`), new `activateAt`, `getLabel`; events `onActivated` (replaces the `onActivate` config callback, so `linkPlugin()` takes no config) and `onLoaded`. Host (`/contract/host`): `isNavigationEngaged` (was `engaged`). The stand-alone source (no annotation plugin) re-reads a loaded page when an annotation on it changes.
