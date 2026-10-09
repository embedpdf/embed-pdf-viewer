---
'@embedpdf/engine-core': patch
---

`origin.sessionId` names the open document (the handle) that made a change, not the engine: every open is its own session. `runPermissionConformance`'s `openSameDocument` receives the suite's engine.
