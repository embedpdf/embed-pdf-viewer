---
'@embedpdf/angular': minor
---

The `epdfSurfaceFocus` directive (`<input epdfSurfaceFocus="search" epdfSurfaceFocusSelect>`) puts the cursor in its element when the panel it names asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element appears while the request is up; `epdfSurfaceFocusSelect` selects an input's text, so typing replaces it.
