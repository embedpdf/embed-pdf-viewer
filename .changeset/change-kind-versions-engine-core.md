---
'@embedpdf/engine-core': minor
---

Every kind of change op and result item says the version it arrived in, so a client and a server of different versions can tell which kinds the other has. `CHANGE_KIND_SINCE` lists the kinds that arrived after 3.0 (`pages.setScale` in 3.1), `changeKindsUnknownTo(version, kinds)` names the kinds a side of that version lacks, and `lacksWhatArrivedIn(version, since)` makes the comparison for anything else that arrived in a version. `stream.desynced` has a second `reason`, `'unknown-change'`: a change of a kind this version doesn't know arrived. Each op of a `POST …/changes` request is now strict about its own fields: an op with a field the schema doesn't name is refused, where the field used to be dropped.
