---
'@embedpdf/snippet': patch
---

Switch toolbar close command from hardcoded pointerMode to activateDefaultMode. On mobile devices the default mode is pan mode rather than pointer mode, and activating pointer mode prevented scrolling (only allowing text selection). Also hide the toolbar divider when document:open and document:close items are not visible.
