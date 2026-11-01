---
'@cloudpdf/engine': patch
---

A share link takes the page's `identity` (the `open()` option, or the viewer's `identity`) as the visitor's answers, the same as the visitor typing them: only the fields the link asks, never `userId` or `groupId`. The share input's `visitor` is gone.

Nothing the page passes is ignored silently: in development the engine warns once when it doesn't use `scope` (the document's token says what the session may do), or when the session doesn't act for the `identity` passed, and says why.
