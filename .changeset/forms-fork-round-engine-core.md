---
'@embedpdf/engine-core': minor
---

- A checkbox's or radio group's value is the checked widget's on-state name (`fieldAfterValue`, `fieldAfterReset`); a default that names a widget by position picks that widget.
- `PageLayout.tabOrder`: the order a page's annotations take keyboard focus in (`/Tabs`), or `null`.
- A list box's `topIndex`: the option in its top row (`/TI`).
- A widget's `fontFamily` names a font as a free text's does: a standard font's name, a registered font's key, or the family of a font the document has.
- `freeTextFontForFace` and `familyKey` (font faces to names), `defaultEntryOfDraft` and `topRowOf` are engine-core's.
- `assertChoiceDefault`: a dropdown's or list box's default is checked against its options (free text only for a dropdown that allows editing). The engine and the predictions refuse the same drafts and updates.
