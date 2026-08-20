---
'@cloudpdf/server': patch
---

Cloud ObjectStore adapters (S3, GCS, Azure Blob) now truly stream `put` bodies: a `Readable` is hashed and length-enforced as it flows (constant memory) instead of being buffered whole. Under- or over-delivery aborts before a visible object can appear, any prior object at the key survives a failed attempt, and the SHA-256 metadata is attached post-stream (S3 via a same-key server-side copy). FsObjectStore now cleans up its `.partial` file when the source stream errors mid-put.
