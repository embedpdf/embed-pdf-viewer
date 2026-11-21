---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/engine': minor
'@embedpdf/core': minor
---

An incremental download can merge into the file's last update section: `download({ mode: 'incremental', mergeLastUpdate: true })`. The bytes before that section stay unchanged, the section keeps every object of the old one that is still in use plus the save's changes (newer wins), and its `/Prev` and `/Size` are rewritten, so saving the same file again and again keeps one update section instead of stacking one per save. Cross-reference tables and streams, object streams, hybrid files (`/XRefStm`) and encrypted files are supported; objects are copied with their numbers, so they stay correctly encrypted. A file without an update yet, a section that holds a signature, or a structure that can't be proven (such as a linearized file) gets a plain append, and later saves merge into that one.
