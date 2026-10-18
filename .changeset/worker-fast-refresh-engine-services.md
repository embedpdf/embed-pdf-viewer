---
'@embedpdf/engine-services': minor
---

Rename `DocumentSession.useObjectNumber()` to `claimObjectNumber()`. It claims a number from the session's reserved object numbers for the open transaction, the counterpart of `reserveObjectNumbers()`. The old name read as a React hook, so dev tools that look for hooks rewrote the engine worker around it.
