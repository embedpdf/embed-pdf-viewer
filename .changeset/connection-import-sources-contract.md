---
'@cloudpdf/contract': minor
---

Add the provider-neutral `connection` source to `documents.importFrom`. Requests identify an operator-registered connection and object key, plus an optional opaque provider-specific revision, without exposing storage-provider configuration or credentials in the public wire contract.
