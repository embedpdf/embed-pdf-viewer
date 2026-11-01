---
'@cloudpdf/plugin-protected-display': minor
---

A protected page is `loading` in the render plugin's picture state until its frame is on screen, so the viewer's spinner shows while protected viewing starts (up to a few seconds for the first page) instead of a blank page. When the pages can't show (no DRM system in common, a refused session) the pages still waiting turn `error`, so no indicator spins forever.
