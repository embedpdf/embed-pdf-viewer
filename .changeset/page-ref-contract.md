---
'@cloudpdf/contract': minor
---

Page routes take a `pageKey` path parameter (`obj:N`, the page's indirect object number) in place of the numeric `pon`, mirroring `annotKey` and `fieldKey`; page mutation bodies send `pages: PageRef[]`, `pages/names` sends `{ name, page }`, and every page-bearing record in the API uses `page`/`pages`.
