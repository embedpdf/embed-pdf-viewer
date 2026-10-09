---
'@embedpdf/engine-services': minor
---

A widget's actions are written: `writeWidgetActions` sets or removes each event's action through the runtime (`/A` for `activate`, the `/AA` entry for the others), from a widget's placement and from a widget update. On a field merged with its widget, the field's own scripts are left alone. The change ops check `doc.forms.script` for a script, submit or URI action, and an update's undo by value converts the read actions back to a write.
