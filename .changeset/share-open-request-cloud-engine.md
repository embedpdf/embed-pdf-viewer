---
'@cloudpdf/engine': patch
---

A renewal the share link refuses for a passphrase, or for questions asked on open, no longer retries on every request. The document asks once (`doc.share.openRequest`, `onOpenRequest`), reads on with its session until it runs out, then waits for `resume()`; with nothing listening, a request fails with the refusal. A shared link's visitor is now kept in the visitor store for the next visit, as the server says (`visitor.keep`).
