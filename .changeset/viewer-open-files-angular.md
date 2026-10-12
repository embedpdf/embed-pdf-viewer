---
'@embedpdf/angular': minor
---

`EpdfDocuments` has `canOpenFiles()`, the documents capability's: whether the engine opens a file from the user's computer.

`commandOf(id)` always gives a command, and so does the `epdfCommand` directive's `command`: an id no plugin registered comes back labelled with its id, neither visible nor enabled (so its button is hidden), and warns once in development with the closest id there is. `run()` on the directive always returns its promise.
