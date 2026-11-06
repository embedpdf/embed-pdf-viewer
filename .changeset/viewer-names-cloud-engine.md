---
'@cloudpdf/engine': patch
---

Follows engine-core: an event's `origin` says `subject`, `at` (ISO 8601), `serverSequence` and `transaction`; the grant's callbacks are `onIdentityRequested` and `onOpenRequested`, and its `resume()` takes `visitorIdentity`.
