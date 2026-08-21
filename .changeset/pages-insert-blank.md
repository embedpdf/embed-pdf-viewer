---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/engine': minor
'@embedpdf/core': minor
'@embedpdf/plugin-page-edit': minor
'@cloudpdf/contract': minor
'@cloudpdf/engine': minor
'@cloudpdf/server': minor
---

Adds page creation across the stack, on both engines. The engine contract gains `pages.insertBlank(spec, destIndex?)` — the blank-page sibling of `pages.insert`: same `doc.pages.assemble` gate, same `PageInsertResult`, same `pages.inserted` event, but a parameters-only wire (no bytes). The local engine implements it natively via `FPDFPage_New` (no source document is retained, unlike the import path), with a new conformance suite and a `pages.inserted` case in the events suite. The cloud reaches insert parity: `POST /pages/insert` (multipart mutation envelope), `POST /pages/insert-blank` (JSON), and `POST /pages/extract` (JSON → PDF bytes, gated by `doc.download`) ship on the server with a page-set-aware commit that adds `layer_pages` rows for the fresh PONs; the cloud engine client implements `insert`/`insertBlank`/`extract`, absorbs inserts by dropping the cached manifest for a lazy refetch, and maps the new `pages.insert`/`pages.insertBlank` audit kinds onto the `pages.inserted` event so collaborators see added pages live over SSE. With parity delivered, `pages.insert`, `pages.insertBlank`, and `pages.extract` are promoted from optional to REQUIRED members of `DocumentPagesService` (the optionality was documented as "only until the server endpoint ships"), and the conformance suites now run unconditionally instead of skipping on absent verbs. The page-edit capability grows the add surface: `addBlank()` (size defaults to the page the new one sits beside), `insert(bytes)` for merging another PDF in, and PON-anchored `placement` (`{ after }` / `{ before }` / `{ index }`) that stays correct across concurrent reorders — all gated by the same `canEdit()` as rotate/move/delete, since every structure verb shares `doc.pages.assemble`.
