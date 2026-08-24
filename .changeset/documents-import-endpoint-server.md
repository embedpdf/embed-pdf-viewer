---
'@cloudpdf/server': minor
---

Implement server-side PDF imports from caller-supplied URLs through the existing document lifecycle. Deployment policy controls size, timeout, concurrency, HTTPS, and public-network requirements; URL handling blocks private and metadata addresses with DNS pinning, rejects redirects, and requires `Content-Length`. Imports enforce optional size and SHA-256 pins, sanitize failures so URL secrets do not leak, leave documents pending after retryable transport failures, and add the `pull` upload kind in migration 025.
