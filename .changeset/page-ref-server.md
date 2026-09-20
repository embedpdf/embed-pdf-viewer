---
'@cloudpdf/server': minor
---

Serve page routes under `:pageKey` (`obj:N`; malformed keys answer 400), accept `pages`/`page` refs in page mutation, extraction, redaction and weak-session bodies, and emit `PageRef` page identity in every response and event while keeping storage keyed by page object number.
