---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@cloudpdf/engine': minor
'@cloudpdf/server': minor
---

Adds the `ignoreWhitespace` search flag: a literal query drops whitespace on both sides instead of collapsing it, so `invoice` finds the letter-spaced `i n v o i c e` that OCR'd scans and tracked-out headings produce (and `total amount` finds `totalamount`). Hits span the original text including the dropped whitespace; with `wholeWord` the boundaries are checked on the original text. Like `matchDiacritics`, the flag is literal-only — `regex: true` + `ignoreWhitespace` is rejected with `InvalidArg` (`ignore-whitespace-with-regex`). The flag rides the search token and the cloud search route (`ignoreWhitespace=true`).
