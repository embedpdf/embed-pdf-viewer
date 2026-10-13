---
'@embedpdf/plugin-commands': minor
---

A command can say whether the session may run it with `allowed`, a function that reads the plugins' `can*` checks (`documents.canPrint()`), and `notAllowedKey`, the translation key of the sentence that says why not. When `allowed` says no, the command is not allowed, as with `requires`: hidden, or disabled with its `disabledReason` under `notAllowed: 'disable'`, and its shortcut refused with that sentence. It's asked only while a document is open; one that throws allows the command. The standard `document:download` and `document:print` commands read `documents.canDownload()` and `documents.canPrint()` this way.

`getRefusal(id, documentId?)` says why a command won't run whatever the moment: turned off, or not allowed for its document, with the sentence for the user; `null` when it may run, for a keyboard help sheet that lists only the keys that work.

A refused command takes its keys only while its `visible` says it would show: Delete with nothing selected stays the page's, even where deleting is turned off.
