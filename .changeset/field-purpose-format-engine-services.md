---
'@embedpdf/engine-services': minor
---

Read and write a form field's `purpose` and `format`, by one rule on the local and the cloud engine.

- **`purpose`** is kept as `/Purpose` in the field's `/EMBD_Metadata`, beside its group. A create and an update write it, `null` in an update removes it, and an entry that is no purpose a write takes reads as none.
- **`format`** on a text field and a dropdown is read from the field's format script (`/AA /F`), as Acrobat decides it: a date, a time, `other`, or `null` without a script. A create and an update write a date or a time as the two scripts Acrobat writes, `AFDate_FormatEx("pattern");` and `AFDate_KeystrokeEx("pattern");` for a date, `AFTime_FormatEx("pattern");` and `AFTime_Keystroke(n);` for a time, in place of the format and keystroke scripts the field had. `null` removes both; on a field with no format script it changes nothing, so a keystroke script on its own stays. The format a field already has changes nothing.
- Both take `doc.forms.modify` alone. A pattern or a purpose that is none, a `format` on another kind of field, and a `format` beside `actions.format` or `actions.keystroke` are refused with `InvalidArg` before anything is written.
- Undo puts both back, and an update's `expect` can name them. A copy and an import keep both; without `doc.forms.script` a date or a time format is written again from its pattern instead of being left out.
