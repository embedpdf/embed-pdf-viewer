---
'@embedpdf/web': minor
---

One way to mount fonts: by program (`mountFontProgram`, `createFontMounts`). `mountWebFont`, `webFontFamily` and `fontKeyOfWebFamily` are gone, and so is `cssFontOf`: `textFieldStyleOf` names no font (the editor's layout does), and `listBoxStyleOf` and `listBoxControlStyleOf` take the widget's font as the form plugin gives it. The free text line model keeps the engine's metrics for the standard families by the family a CSS family stands for (`lineModelFor` and `firstLineShiftFor` take `familyOf`, `FamilyOfCss`; the rich text editor passes its host's `familyOfCss`); `styleDeltaOf` reads a family back as it is by default. A `text` scene node's `program` is mounted like a `textRun`'s.
