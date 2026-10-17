---
'@embedpdf/viewer-chrome': minor
---

A document that couldn't be opened says why, on its pane and on its tab's warning sign: the file wasn't found, the user has no access, it isn't a PDF or is damaged, or this viewer can't open that kind of document. **Try again** next to Close opens it again in the same tab.

Changes that would be lost are asked about first: closing a tab whose document has changes that weren't downloaded asks before it closes, and leaving the page asks while any document has them. What the app's own code closes doesn't ask.

The tabs' labels (Close, Loading, an unnamed document) are translated.
