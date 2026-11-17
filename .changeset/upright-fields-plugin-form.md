---
'@embedpdf/plugin-form': minor
---

Place form fields upright on turned pages, and fill in fields that are turned.

- The form tools place a field the way its author sees the page: on a page shown turned, a click makes the tool's size as seen and the field is turned a quarter so that what's typed reads upright there. The placement states the field's `box` and `rotation`; the ghost and the placed field agree at every quarter turn. Nothing changes on a page that isn't turned.
- Each entry of `listWidgets()` and the result of `getWidgetAt()` now say where a field is with `box`, `rotation` and `rect`: the frame its contents are laid out in, its quarter turn, and where it stands on the page. `box` was the rect. For a field that isn't turned they are the same, so only turned fields change, and those were drawn with their controls the wrong way; this is a fix.
- `getWidgetAt()` finds a turned field where it stands.
- `addWidget()` without a place lines the new box up with where the field's boxes stand, for turned boxes too.
