---
'@cloudpdf/sdk': minor
---

Every error response is one type, `ErrorResponse`, with its error `EngineError` and a `code` from one list, replacing `EngineErrorPayload`, `AdminErrorPayload` and the per-operation error types such as `DocHead404Response`. A response type is named after its operation alone (`DocFormsListResponse`, not `DocFormsList200Response`). Sizes, counts, durations and timestamps are integers, and `nextCursor`, `thumbnailState` and `thumbnailUrl` are always there.
