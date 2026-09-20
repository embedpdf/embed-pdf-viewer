---
'@embedpdf/engine-core': minor
---

Add the `ignoreWhitespace` flag to `SearchQuery`. A literal query folded with it drops whitespace on both sides instead of collapsing it, so `invoice` finds the letter-spaced `i n v o i c e` that OCR'd scans and tracked-out headings produce, and `total amount` finds `totalamount`. Hits still span the original text including the dropped whitespace, and `wholeWord` boundaries are checked on the original text. The flag is literal-only — `validateSearchQuery` rejects it together with `regex` (`ignore-whitespace-with-regex`) — and it round-trips through search tokens. `foldText` gains the matching `dropWhitespace` option, and the shared search conformance suite covers the flag.
