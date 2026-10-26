---
'@embedpdf/engine-core': minor
---

New engine code `VisitorIdentityRequired`: a share link asks who the visitor is, and its `details` (`VisitorIdentityRequest`: `fields`, `missing`, `invalid`, `purpose`, `privacyUrl`) say what; `visitorIdentityRequestOf(error)` reads them. `OpenInputShare.visitor` sends the visitor's answers (`VisitorAnswers`) with the open. `DocumentHandle.share` is now a `DocumentShare`: besides `layerMode` and `keep`, `identityRequest` says what the link asks before the first change, `identify(answers)` answers it, `onIdentityRequest` is called when a change waits for the answers, and `decline()` lets the waiting changes fail.
