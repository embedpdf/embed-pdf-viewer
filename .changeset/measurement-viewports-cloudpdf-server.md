---
'@cloudpdf/server': minor
---

Layers and versions keep `viewports_version` (migration 053), raised by a scale change and by nothing else, so the outline, search and export caches stay warm across one. The layout's cached URL carries it; a token without it gets the layout without viewports. `PUT …/pages/:pageKey/scale` is a one-op change, so its opId undoes it. The changes endpoint applies `pages.setScale`.
