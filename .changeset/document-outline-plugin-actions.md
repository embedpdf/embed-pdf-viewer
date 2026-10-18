---
'@embedpdf/plugin-actions': minor
---

An action can come from an outline item: `ActionSource` and `ActionTreeSource` gain `{ kind: 'outline', item }`, and a script an outline item runs sees `event.type` `'Bookmark'`, as in Acrobat.
