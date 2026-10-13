---
'@embedpdf/vue': minor
---

`useSurfaceFocus(id, element, { select? })` puts the cursor in an element (a template ref) when the surface `id` asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element mounts while the request is up; `select` selects an input's text, so typing replaces it.
