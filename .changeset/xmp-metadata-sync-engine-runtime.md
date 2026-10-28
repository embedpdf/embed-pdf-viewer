---
'@embedpdf/engine-runtime': minor
---

New `EPDFCatalog_GetMetadata` reads the document's XMP packet (the catalog's `/Metadata` stream) decoded, and `EPDFCatalog_SetMetadata` replaces it, unfiltered, keeping the stream's object number, or removes it.

Saving an encrypted document encrypts its metadata stream, unless the file says `/EncryptMetadata false`; it was written in the clear, so readers decrypted the XMP into noise. A metadata stream with a filter is written decoded, where its encoded bytes were written without the filter that decodes them.
