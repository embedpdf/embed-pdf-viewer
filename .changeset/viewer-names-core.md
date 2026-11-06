---
'@embedpdf/core': minor
---

`destroy()` is the one verb that ends an object's life, never `dispose()`: prepared and staged prints, `Scope` (with `destroyed`), event hook sources, the settings store and the test kernel. `acquire(get, release)` names its second argument for what it does. `Kernel.getStatus()` replaces `status()`. A document's page-list counter is `pagesSequence` (on `DocumentMeta` and `DocumentPagesChangedEvent`), not `revision`, which in a PDF means a saved file revision. `PendingPage` is tagged `kind`. Settings events carry `changedKeys`, as metadata's do. Mirror specs take `onChanged`. A document's grant question is `openRequest`, as the engine names it, and `retry()` takes `visitorIdentity`. `changes.listPending()` and the page view's `getPending(page)` start with a verb.
