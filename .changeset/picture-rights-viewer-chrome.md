---
'@embedpdf/viewer-chrome': minor
---

The thumbnails panel follows its own permission: its rail draws each page's thumbnail, and the panel is there only when the session may have thumbnails (`doc.render.thumbnail`, which `doc.render` includes), like any command the session may not run. The reason it's missing is translated into every language the viewer ships.
