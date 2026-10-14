---
'@embedpdf/plugin-search': minor
---

Expose search hit ranges as `start` and `count`, report progress as
`pagesSearched` and `pageCount`, and use `from` to select the starting page.
Callers can request snippets with a boolean option, with permission checks
that match whether result text will be returned.
