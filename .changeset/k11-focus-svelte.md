---
'@embedpdf/svelte': minor
---

The `surfaceFocus(id, { select? })` attachment (`<input {@attach surfaceFocus('search')} />`) puts the cursor in its element when the surface `id` asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element mounts while the request is up; `select` selects an input's text, so typing replaces it.
