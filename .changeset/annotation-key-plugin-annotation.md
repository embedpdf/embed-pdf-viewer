---
'@embedpdf/plugin-annotation': minor
---

The plugin's `refKey` is gone; model ids are the engine's `annotationKey`, so a map keyed by ref in application code can never disagree with the plugin's own. Names (`nm`) are now keyed with their page, closing a collision between same-named annotations on different pages in legacy PDFs. Event lookups compose the address from the event's page and stable id.
