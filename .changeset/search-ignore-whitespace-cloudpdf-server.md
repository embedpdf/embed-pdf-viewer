---
'@cloudpdf/server': minor
---

The layer search routes (`/v1/docs/:docId/layers/:layerName/search/{rects,full}/data`) accept `ignoreWhitespace=true` alongside the other query flags and forward it to the engine, so a cloud search for `invoice` finds a letter-spaced `i n v o i c e`. Combining it with `regex=true` is rejected with `InvalidArg`, and the flag is carried by the search tokens that page through results.
