---
'@embedpdf/engine-services': minor
---

Local engines honour the `ignoreWhitespace` search flag: a query carrying it re-folds the cached page text with whitespace dropped, so `invoice` finds a letter-spaced `i n v o i c e`, and search cursors key on the flag so a resumed search never mixes hits from the two folds. Combining the flag with `regex` is rejected with `InvalidArg`.
