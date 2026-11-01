---
'@cloudpdf/server': patch
---

Opening a document to edit no longer creates its layer. A layer nobody has changed reads the base document, so `/access` hands its editing session object numbers counted past the base document's last object, without storing the layer or opening a worker session for it. The layer is stored at its first write. Object numbers are now kept by document and layer name (migration 036), and numbers a layer was handed on one base version start over on another. The sweeper forgets the numbers of layers nobody changed once their editing sessions have been expired for a session lifetime, so someone who only looked leaves nothing behind.

Layer worker sessions no longer stay open for the life of the document. The sweeper closes a layer's session after it goes unused for `layerSessionIdleMs` (default 10 minutes), and a document keeps at most `maxLayerSessionsPerDoc` layer sessions open (default 32), closing the least recently used beyond that. The next request reopens a closed session from the stored layer. Searching a layer whose text and page order are still the base document's now runs on the base, without opening a session for the layer.

A write retried on two replicas under the same change id now answers what the first one committed, also when that commit spent the write's object numbers while the second was still preparing.
