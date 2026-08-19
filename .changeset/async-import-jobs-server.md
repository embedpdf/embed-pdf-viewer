---
'@cloudpdf/server': minor
---

Add durable asynchronous document imports backed by the `document_imports` job table and an in-process worker with one claim loop per replica. Document and job creation is atomic, lease-token-fenced transitions prevent stale workers from overwriting replacements, reconcile-on-claim avoids duplicate transfers after crashes, and exhausted retries fail the document and clean destination bytes. Retries stay pinned to one content identity, filesystem sources require `expected.sha256`, and queued or running imports are protected from the stale-pending sweeper. Migration 027 stores the re-drivable source descriptor in `source_json`.
