---
'@cloudpdf/server': minor
---

Add durable two-phase digital signing with prepare, complete, abort, and expiry handling. Persist candidate data so completion can run on another replica, verify the supplied CMS, and reject completion when the document or layer has changed.

Publish each completed signature as an immutable document version while retaining the document ID and version history. Consume the signing layer's edits into the new base and refresh document state across replicas.

Add signature inspection and analysis routes, immutable version and revision downloads, and visual signature-field appearances. Use files and streaming storage transfers for signing candidates, with configurable temporary storage and signing expiry.
