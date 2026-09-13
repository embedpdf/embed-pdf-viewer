---
'@embedpdf/engine-core': minor
---

Add digital signature and document version types, signing permissions, events,
wire schemas, and the optional `DocumentSignaturesService` API. Support
signature-field authoring and appearances, file-backed layer inputs, file
downloads, and configurable session and signed-document policies.

Add revision change analysis and protection helpers that distinguish declared
editing restrictions from the rules used to judge later modifications.

Prevent excessive processing time when decoding malformed base64 containing long
runs of padding characters.
