---
'@cloudpdf/engine': minor
---

The cloud engine works with a server that is older or newer than it for change kinds. A change with a kind of op the server doesn't have yet is refused on its own, before anything is sent, with `NotImplemented`; its `details` name the op (`kind`), the version that has it (`needs`) and the server's (`serverVersion`). The changes called beside it still go out. A change from another session of a kind this version doesn't know now reads as `stream.desynced` with `reason: 'unknown-change'`, so everything is read again; before, it became an event without a type and reads stayed stale.
