---
'@cloudpdf/server': minor
---

Validation data for signatures, and a document timestamp with no field.

- `GET /v1/docs/:docId/layers/:layerName/signatures/validation-info` answers the certificates, OCSP responses and CRLs the layer's file holds, each as base64. Its `@token` form is pinned at `docVersion` and cached like the signature list. It needs `doc.forms.read`.
- `POST` to the same path stores more. Each entry is checked to be one DER object of at most 16 MiB, an entry the file already holds is not stored again, and the answer counts the new ones. It needs `doc.sign` for the document, and a certification that allows no changes forbids it. The document version moves, and the audit row, of the new kind `signature.addValidationInfo`, carries the counts and never the entries. A client older than 3.3 gets a full refresh in its place.
- The server asks no certificate authority: it stores what it is given.
- `POST …/signatures/prepare` takes a document timestamp with no `field`. The worker makes the field, the answer names it in `field`, and it needs `doc.sign` for the document.
- Changing the metadata of a layer is now refused after a certification that allows no changes, before the write reaches a worker.
