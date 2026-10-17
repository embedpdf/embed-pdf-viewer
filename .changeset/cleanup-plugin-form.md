---
'@embedpdf/plugin-form': minor
---

Form fields stay in sync from the document's confirmed events (every origin) instead of re-reading after each write, and widget boxes are kept per page. `ensureLoaded(page)` returns a promise. `createSerialQueue` is no longer exported, and the `/internal` entry is removed; hosts use `/contract/host`.

Form field and widget operations now use object-number references, flat flag values, page-space widget boxes, and the revised engine create, update, and removal results.
