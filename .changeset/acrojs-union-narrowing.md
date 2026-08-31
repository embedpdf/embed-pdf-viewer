---
'@embedpdf/core-acrojs': patch
---

`javaScriptSourcesFromActionTree` narrows on the new discriminated action-node union; only `javascript` arms are collected (rendition `/JS` is preserved on the tree but deliberately not executed).
