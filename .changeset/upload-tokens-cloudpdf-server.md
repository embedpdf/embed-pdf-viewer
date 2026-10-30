---
'@cloudpdf/server': minor
---

Upload tokens let a browser upload straight to CloudPDF. `tokens.issue` with kind `upload` makes one for a folder, with your metadata, a file count (one by default), an optional size limit and an origin lock. The token reaches only init, commit and the proxy upload. There it uploads into its folder with its metadata, whatever the request says, and commits only the documents it started. Every other route refuses it. Migration 048 adds `documents.upload_token_jti` and the `upload_token_uses` table, which counts each token's documents atomically.
