---
'@embedpdf/engine-core': minor
---

Address pages by `PageRef` everywhere. A page's identity is `{ kind: 'objectNumber', pageObjectNumber }`, built with `toPageRef(n)` and compared with `pageRefsEqual`; `encodePageKey`/`decodePageKey` give it the `obj:N` wire form that mirrors `annotKey` and `fieldKey`.

`DocumentHandle.page(ref)`, `pages.move/rotate/delete/flatten/extract(pages: PageRef[])`, `pages.setName({ name, page })`, `annotations.listRaw(page)` and `beginWeakEdit(pages)` take refs. `PageLayout.ref` and `PageHandle.ref` replace `pageObjectNumber`, and every record that points at a page carries `page: PageRef`: `AnnotationRef`, `AnnotationDTO`, `RevisionToken`, `PageState`, `FormWidgetRef` (`null` when unplaced), `PdfDestination`, `SearchMatch`, `NamedPageTarget`, cache deltas and comment threads. Document events carry `page`/`pages`; `PageInsertResult.insertedPages` and the per-page items of flatten, redaction and scale results carry `page`. Weak-annotation session requests and responses use `pages`.
