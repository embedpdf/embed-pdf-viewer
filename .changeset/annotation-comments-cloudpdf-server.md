---
'@cloudpdf/server': minor
---

Persist per-layer annotation versions and add versioned page and
whole-document annotation reads with audit-head metadata. Expose a no-store
backend endpoint for listing every annotation in a layer. Annotation mutations
now advance the version atomically so clients can hydrate and retry against
coherent snapshots.
