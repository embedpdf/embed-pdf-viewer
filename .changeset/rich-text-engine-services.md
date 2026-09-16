---
'@embedpdf/engine-services': minor
---

Read and write FreeText rich-text documents through the shared annotation services, preserve registered font keys on readback, and reject mismatched plain and rich text before applying a mutation. Default-style changes preserve explicit run overrides, while plain-text replacement resets run formatting.

Carry font identity, editing authorization, and document font settings through the worker protocol.
