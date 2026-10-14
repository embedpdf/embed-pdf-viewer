---
'@embedpdf/react': minor
---

`useSurfaceFocus(id, ref, { select? })` puts the cursor in `ref`'s element when the surface `id` asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element mounts while the request is up; `select` selects an input's text, so typing replaces it.
