---
'@cloudpdf/contract': minor
'@cloudpdf/server': minor
---

`documents.import` gains `mode: "async"`: the request answers 202 (`tag: "accepted"`, document `pending`) and an in-process worker — one claim loop set per replica, no separate deployment unit — performs the transfer on the `document_imports` job table with crash-safe semantics: atomic document+job creation in one transaction, lease-token-fenced transitions (a stale worker can never overwrite its replacement), reconcile-on-claim (a crash between commit and job bookkeeping completes instead of re-transferring), exponential-backoff retries with exhaustion explicitly failing the document and cleaning destination bytes, and retries pinned to one content identity (requested revision, else the revision captured on the first successful open, else `expected.sha256`). Async accepts connection sources only — presigned URLs are perishable secrets and stay synchronous — and filesystem sources additionally require `expected.sha256`. Queued/running jobs shield their pending documents from the stale-pending sweeper. Poll `GET /documents/:id` for completion; migration 027 adds the re-drivable `source_json` to `document_imports`.
