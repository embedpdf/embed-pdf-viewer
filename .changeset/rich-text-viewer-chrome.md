---
'@embedpdf/viewer-chrome': minor
---

Add bold, italic, and underline controls to the FreeText style panel while preserving the active text selection.

Support `annotations.fonts` for additional font choices. Fonts are fetched, registered with the engine, and mounted for the live editor before appearing in the picker, so editing and PDF output use the same font bytes.
