---
'@embedpdf/plugin-commands': minor
---

Commands follow the document in scope. Resolved for a document, such as inside a `<DocumentScope>` or through `ctx.forDocument()`, `execute()`, `canExecute()`, `resolveCommand()`, `listCommands()` and `searchCommands()` act on that document when the call leaves the document out. Outside a scope they act on the active document, and a document named in the call always wins.
