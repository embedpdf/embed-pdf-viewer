---
'@embedpdf/engine-core': minor
---

One string key for an annotation address: `annotationKey(ref)` (`obj:<n>` for object numbers, which are document-unique; `nm:<page>:<name>` because `/NM` is only unique per page; `idx:<page>:<i>` for weak refs) and `refFromStableId(page, id)` to rebuild an address from an event's page and stable id. The page-qualified `refKey` is removed; thread and comment composition use `annotationKey`. The wire encoders `encodePageKey` and `encodeStableIdKey` are unchanged.
