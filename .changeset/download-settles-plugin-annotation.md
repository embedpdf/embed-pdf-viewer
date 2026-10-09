---
'@embedpdf/plugin-annotation': patch
---

A download includes the text typed a moment ago and an ink drawing waiting for its next stroke. Typed text is written once typing pauses, and a grouped ink drawing once its grouping window ends, so a download in between, such as an autosave or a save shortcut, could miss them. They are now written first. A stroke still being drawn is left as it is.
