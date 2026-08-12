---
'@cloudpdf/server': minor
---

Fixes presigned-upload materialization and makes commit-time sha verification single-read and constant-memory.

- Fixes the range materializer crashing with `EBADF` whenever an object carried no SHA metadata — the shape of every presigned browser upload. The failure was silent: commits still reached `ready` while the security probe recorded `unknown` and thumbnail warming recorded `failed`. The hash fallback now closes the write-only handle and streams the finished partial from disk, guards against short positional writes, and rejects a metadata/expected-sha disagreement before paying for the download.
- Replaces the S3 and FS `getSha256` fallbacks that buffered whole objects in RAM with streaming hashes — constant memory regardless of document size.
- Commit now verifies uploaded bytes with a single object-store read when a base-file cache is wired (`DocumentLifecycleOptions.fileCache`): the upload is materialized into the cache, hashed on the way down, and reused by the security probe instead of being downloaded a second time. `LocalFileHandle.sourceKey` reports which object key materialized a content-addressed entry, so a cross-key cache hit still triggers a direct verification of the committing document's own object.
- Adds a typed `ShaMismatchError` (exported) thrown by all `materializeLocal` implementations, letting callers distinguish declared-hash mismatches from retryable transport failures.
- Surfaces previously swallowed failures: `DocumentSecurityProbeOptions.onError`, `DerivedRenderServiceOptions.onWarmError`, and base-file-cache `materialize-error` events are now wired to the server log.
