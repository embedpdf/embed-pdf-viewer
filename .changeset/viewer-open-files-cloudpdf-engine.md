---
'@cloudpdf/engine': minor
---

The cloud engine says `canOpenFiles: false`: it opens the documents your server holds (`'id'`, `'token'`, `'share'`), never a file's bytes, so a viewer on it offers no way to open a file from the user's computer.
