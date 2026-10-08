---
'@embedpdf/viewer-chrome': patch
---

Toolbar menus and the style panel's dropdowns also close on a press on the page around the viewer. The page's `--epdf-accent`, `--epdf-scrollbar-thumb` and `--epdf-toolbar-*` win over the chrome's defaults in light and in dark, whether set on the viewer or on an element around it; with none set, the chrome's defaults also reach the parts drawn on the pages, so both agree.

The viewer handle carries the viewer's kernel for the framework wrappers, under a registered symbol. It is not part of the handle's API.
