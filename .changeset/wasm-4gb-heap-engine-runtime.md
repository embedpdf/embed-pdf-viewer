---
'@embedpdf/engine-runtime': patch
---

The WASM runtime's memory can now grow to 4 GB instead of 2 GB, so a worker with several large documents open no longer runs out at 2 GB. Addresses above 2 GB are read correctly: pointers from the runtime, from `mem.alloc` and from `mem.peek(ptr, 'ptr')` are unsigned, and `mem.peek(ptr, 'ptr')` now returns a `Ptr`, as on the native runtime. Browsers that limit memory lower, such as Safari on iOS, behave as before.
