---
'@embedpdf/core-annotation': minor
---

The annotation model uses full names. `Point` replaces the `Vec` alias, `ContentGeometry` replaces `Geom`, `ModelAnnotation` replaces `Annot`, and `Message` replaces `Msg`; an annotation's `geom` is `geometry`. Discriminants follow one rule: things that are use `kind` (geometry, hit targets, drafts) and things that happen use `type` (messages, effects). `ChromeGeom` is `ChromeGeometry` and `DEFAULT_CHROME_GEOM` is `DEFAULT_CHROME_GEOMETRY`; a paint's `cap` is `lineCap`; a draft's `cur` is `current`.
