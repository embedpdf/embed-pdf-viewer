---
'@embedpdf/engine-core': minor
---

`Engine` has `canOpenFiles`: whether `open()` takes a file's own bytes (`{ kind: 'bytes' }`), such as a file someone picked on their computer. Every engine sets it; the local engine says `true`, the cloud engine `false`.
