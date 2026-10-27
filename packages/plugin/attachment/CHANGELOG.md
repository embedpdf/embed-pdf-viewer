# @embedpdf/plugin-attachment

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `AttachmentState`, what `attachmentState` reads and `useAttachmentState()` returns, the State table of the attachment page with a comment on each field. Published types now name it instead of spelling out its fields.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – New plugin: the files a document carries. `attachmentPlugin()` lists them as one list: the document's attachments, read when something asks (`ensureLoaded()`, or reading `attachmentState`), then the files of its file attachment annotations, from the annotation plugin. `add()` attaches files as one undoable change, giving a name the document has already a number (`notes (2).txt`), and shows them at once; `remove()` takes an attachment, or a page's file attachment annotation, away as one undoable step, and an undo draws the file back before the engine answers. `download()` returns a file's bytes with its name cleaned of control and bidi characters (`displayNameOf`) and its type; `reveal()` goes to a page's file, and `select()` / `getSelected()` keep the files a panel's commands act on. `canAdd()`, `canRemove()` and `canDownload()` answer what the session may do.
