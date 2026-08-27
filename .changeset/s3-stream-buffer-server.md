---
'@cloudpdf/server': patch
---

Fix AWS S3-backed streaming uploads by buffering small source chunks before the SDK applies checksum framing, preventing `InvalidChunkSizeError` during document imports and other streamed writes. Handled 5xx responses now also emit structured error logs with the request ID and HTTP status.
