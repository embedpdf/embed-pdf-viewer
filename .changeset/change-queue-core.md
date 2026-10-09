---
'@embedpdf/core': minor
---

One change per user action, shown at once:

- **`ctx.changes`**, the document's change queue, shared by its plugins. `stage({ label, ops, undo? })` stages one change (the engine's ops) and sends it with `doc.apply` after everything staged before it; it returns the pending change, with its `opId` and the engine's answer (`result`). `hold(label)` gives a change that can be amended until it is sent (`open` says whether it still can, and `change` is the change it is once it has ops), `group(label, run)` makes everything staged inside `run` one change, `takeObjectNumber()` and `reserveObjectNumbers()` name new objects before the engine answers, and `pending()`, `hasPending()`, `whenSettled()`, `onStaged` and `onSettled` follow the queue. A refused create takes the changes that refer to what it would have created with it (`conflict`, `details.reason: 'dependency-refused'`). A download sends every open hold and waits for every answer first.
- **Mirrors predict:** a mirror's or page mirror's spec takes `predict(value, op)`, and `view()` / `view(page)` show the confirmed value with this session's pending changes on top. A change leaves a view once that mirror holds its answer: when it folded the change's last event, even before the answer arrives, or after a read it asked for.
- **One store update per change:** the events of one change land at once, whoever made it.
- The test context (`@embedpdf/core/testing`) has the same queue, sending through the test document's `apply`.
