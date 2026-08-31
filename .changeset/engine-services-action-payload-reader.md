---
'@embedpdf/engine-services': minor
---

The action-model walker now materialises interpreter payloads (destinations, URIs + `/IsMap`, named-action names, Hide targets + `/H`, ResetForm three-state fields + exclude, file specs) with reserve-before-allocate budgeting — payload lengths are charged against the aggregate read budget before any scratch buffer is allocated, and name-tree script names ride the same budget. `readActionModel` and the annotation/form field readers take the owning document pointer; `readDestination` moved to a shared `features/destinations/` home. The link target is now a pure projection of the payload-carrying activate tree (`linkTargetFromActionTree`) — the duplicate native root-read is gone, an `incomplete` tree projects `unsupported`, and a malformed `/A` no longer silently falls back to `/Dest`.
