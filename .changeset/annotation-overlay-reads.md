---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/engine': minor
---

Local reads for viewers that show some annotations themselves. `page(pon).render.raw({ excludeAnnotations })` draws the page without the given annotations or widgets and with the others, in PDFium's order and by its flags (`RawPageRenderOptions`). `page(pon).annotations.renderAppearancesRaw({ refs })` renders only the named annotations (`LocalAnnotationAppearanceRenderOptions`). `page(pon).annotations.readAppearanceText(ref)` reads the text an annotation's normal appearance shows, as lines, and where its first glyph sits on the page (`AnnotationAppearanceText`), so an editor can put its text where the appearance draws it. `runRenderExclusionConformance` locks all three.
