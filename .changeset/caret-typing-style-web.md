---
'@embedpdf/web': minor
---

The rich text editor keeps up with fast typing: an update that brings back text the editor already reported is late, not a change, so it no longer undoes the keystrokes typed after it. `RichTextEditorHost.onInput` may return the document the host keeps (text typed at the caret in a style chosen there), which the editor shows at once, and `TextBoxEditorAnnotation.draftRichText` returns it. A format shortcut reports the selection as it is before the command runs, and the caret is reported once an input method composition ends instead of while it moves through it.
