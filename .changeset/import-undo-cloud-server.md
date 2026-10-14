---
'@cloudpdf/server': minor
---

An annotation import is a change: kept in the change outcomes under its `Idempotency-Key` with the record that undoes it, so `POST …/changes` with `{ undoOf }` undoes and redoes it, and a retry is answered from the outcome. Still audited as `annot.import`.
