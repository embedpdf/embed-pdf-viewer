---
'@cloudpdf/engine': minor
---

Cloud-backed search honours the `ignoreWhitespace` query flag, which travels inside the search token, and search cursors are pinned to it: replaying a cursor minted with the flag against a query without it (or vice versa) is rejected with `InvalidArg`, matching the local engine.
