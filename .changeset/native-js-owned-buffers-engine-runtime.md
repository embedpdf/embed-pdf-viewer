---
'@embedpdf/engine-runtime': patch
---

The native addon's `readBytes`, which also returns every rendered bitmap, copies into a JS-owned `ArrayBuffer` instead of wrapping a malloc'd copy as an external one. Electron's V8 sandbox forbids external buffers (`napi_create_external_arraybuffer` fails with `napi_no_external_buffers_allowed`), so the native engine crashed on its first render inside Electron. It still makes one copy, and the buffers it returns can now be transferred to other threads.
