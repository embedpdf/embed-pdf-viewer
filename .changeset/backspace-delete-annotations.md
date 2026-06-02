---
'@embedpdf/plugin-annotation': minor
---

Add Backspace/Delete keyboard support for deleting selected annotations.

- New `deleteSelectedAnnotations()` method on the annotation capability and document scope. It deletes every currently selected annotation (shapes, free text, ink/signatures, stamps, form-field widgets, etc.) in one call, respecting the existing `ModifyAnnotations` permission guard and undo/redo history.
- The default viewer's `annotation:delete-selected` command is now bound to the `Backspace` and `Delete` keys and deletes the full selection (previously only the first selected annotation). When no annotation is selected it falls back to removing a selected pending redaction, so the same keys also delete redactions. The command is disabled when nothing is selected, so the keys keep their native behaviour otherwise. Typing in form fields / free-text editors is unaffected (the shortcut handler ignores key presses inside inputs and editable content).
