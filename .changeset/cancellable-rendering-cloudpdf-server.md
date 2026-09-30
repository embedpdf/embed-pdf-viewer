---
'@cloudpdf/server': minor
---

Stops work for clients that went away: a request whose client disconnects before its reply is sent now aborts its engine job, where before no disconnect was ever detected. A render shared by several requests stops only once all of them have left.

Serve the revised document, page, annotation, form, and rendering contracts, including object-number page references, page-space geometry, annotation transfer, custom metadata, and signature-aware mutation checks.
