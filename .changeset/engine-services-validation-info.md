---
'@embedpdf/engine-services': minor
---

Read and store a document's validation data, and read a page's earlier annotation list from the file.

- `ValidationInfoReader` reads the certificates, OCSP responses and CRLs of the document security store (`/DSS`), and `ValidationInfoMutator` stores new ones. The mutator checks every entry before it writes the first, and leaves out an entry the document already holds.
- The worker host answers two new requests, `signatures.validationInfo` and `signatures.addValidationInfo`. The second is a write: it runs in one transaction and has no undo.
- `SignatureAnalyzer` reads the objects the rules ask for that a revision did not write, and hands them to the rules. A signature field or timestamp that Acrobat adds to a page whose annotation list is an object of its own now reads `permitted` for the earlier signature.

This needs a runtime that has `EPDFDss_GetCount`, `EPDFDss_GetData`, `EPDFDss_Add` and `EPDFDoc_GetLoadedObjectValue`.
