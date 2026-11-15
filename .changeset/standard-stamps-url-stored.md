---
'@embedpdf/viewer-chrome': patch
'@embedpdf/viewer': patch
---

A stamp library of your own as the standard stamps (`plugins.stamp.standard: '/my-stamps.pdf'`) is no longer stored in the browser. It was imported under the id its file names, or a fresh one when it names none (an Acrobat stamp file), so the viewer kept it in IndexedDB and imported it again beside the stored copy on every visit: one more copy in the stamps panel each time. It now goes in under the standard id, like the copy that ships, so it is never stored and `standard:<name>` in `quick` finds its stamps. Copies already stored stay in the panel, where each can be removed. Fixes #1084.
