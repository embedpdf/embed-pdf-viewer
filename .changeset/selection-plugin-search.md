---
'@embedpdf/plugin-search': minor
---

`goToHit()` takes the hit itself as well as its index, so `<SearchLayer onHitClick={(hit) => search.goToHit(hit)}>` makes a clicked match the active one. A hit kept from before the search ran again is found by the characters it covers; one that isn't among the current hits returns `null` and changes nothing.
