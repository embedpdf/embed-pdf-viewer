---
'@cloudpdf/viewer': patch
---

The viewer takes `identity` again: who your page knows the user is. A document token decides for itself, and a share link takes it as the visitor's answers to what the link asks, so the questions it covers aren't asked. `src.visitor` is gone; `scope` stays out, since the token says what the user may do.
