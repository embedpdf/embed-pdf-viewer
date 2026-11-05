---
'@cloudpdf/contract': minor
---

Every error response is the one error body, `ErrorResponse`, with its error `EngineError`; `AdminErrorPayloadSchema` and `AdminThumbnailUnavailablePayloadSchema` are gone, and a thumbnail that isn't ready says its state in `details.state`. Operations no longer get a type per error status, so a response type is named after its operation alone (`DocFormsListResponse`, not `DocFormsList200Response`). Sizes, counts, durations and the admin timestamps are integers. `nextCursor`, `thumbnailState` and `thumbnailUrl` are always there, and the license status's `license`, `reporting` and `usage` too (`null` when there's nothing). A union of whole-number literals, such as a rotation or a DocMDP level, is one integer enum in `openapi.json`.
