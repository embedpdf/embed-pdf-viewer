---
'@cloudpdf/contract': minor
---

Adds the integrity-pinned `init → transfer → commit` document upload protocol,
including presigned PUT and policy-controlled multipart proxy transfer modes.

Declares the shared cursor-pagination protocol for tenant, document, and share
list operations so every generated SDK can expose native pagers and iterators.
