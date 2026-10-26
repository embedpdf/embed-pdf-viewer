---
'@cloudpdf/contract': minor
---

A share link's `visitorLayerIdleSeconds` is nullable and null by default: visitors' layers stay until they are deleted on purpose. Set it (an hour to 30 days) only for links whose visitors' layers are throwaway, and set it back to null on `shares.update` to stop deleting them.
