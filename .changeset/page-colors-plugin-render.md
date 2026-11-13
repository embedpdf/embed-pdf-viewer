---
'@embedpdf/plugin-render': minor
---

The render plugin draws pages in other colors: the `pageColors` setting (`'normal'`, `'dark'`, `'sepia'`, or colors of your own) recolors every picture it draws, the pages, their tiles and their thumbnails, and `updateSettings({ pageColors })` redraws them all while the app runs: it makes every picture stale (`onInvalidated` with `scope: 'content'`, and `getRenderEpoch` moves on). `renderPage` and `renderThumbnail` take a `pageColors` of their own, and `'normal'` draws a picture as the file has it whatever the setting says. Text and shapes become one color each; pictures, scans and shadings are not recolored.
