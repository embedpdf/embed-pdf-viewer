---
'@embedpdf/plugin-attachment': minor
---

New plugin: the files a document carries. `attachmentPlugin()` lists them as one list: the document's attachments, read when something asks (`ensureLoaded()`, or reading `attachmentState`), then the files of its file attachment annotations, from the annotation plugin. `add()` attaches files as one undoable change, giving a name the document has already a number (`notes (2).txt`), and shows them at once; `remove()` takes an attachment, or a page's file attachment annotation, away as one undoable step, and an undo draws the file back before the engine answers. `download()` returns a file's bytes with its name cleaned of control and bidi characters (`displayNameOf`) and its type; `reveal()` goes to a page's file, and `select()` / `getSelected()` keep the files a panel's commands act on. `canAdd()`, `canRemove()` and `canDownload()` answer what the session may do.
