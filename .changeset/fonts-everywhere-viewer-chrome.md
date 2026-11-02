---
'@embedpdf/viewer-chrome': minor
---

`fonts` is a setting of the viewer's own (`ViewerCustomization`, with `ViewerFont.label`): each font is read once and registered on a local engine, and the fonts plugin draws it by program; a cloud engine's fonts are its server's, so the setting is ignored there, with a warning. The style panel's font picker lists every font text can be written in, for text boxes, form fields and redaction labels alike: In this document, Your fonts (Server fonts on the cloud), then the standard fonts; a font that can't be chosen shows greyed with why, and a box's own font shows either way. A typed signature's font goes to the stamp plugin, which registers it where the mark is written, and the maker shows the typed name in it.
