---
'@embedpdf/core': minor
---

`ctx.changeCount()` says how many times the store changed: a state or mirror write anywhere, or a
`ctx.notify()`, counted when the change happens, also while the change stream is held. Give it to
`memo` or `memoByKey` as the input of a read whose answer comes from functions you can't name the
inputs of, so the read asks them once per store change, however many readers ask. Test contexts
from `@embedpdf/core/testing` have it too.

`memo` and `memoByKey` compare their inputs with a plain loop, which makes every cached read a
little cheaper.
