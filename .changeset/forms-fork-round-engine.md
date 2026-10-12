---
'@embedpdf/engine': minor
---

- `PageLayout.tabOrder` and a list box's `topIndex`.
- A widget's `fontFamily` can be a registered font's key, and reads back as one. Changing a widget's colour or size keeps its font; changing a free text's border colour keeps its font.
- Setting a field to the value it holds writes nothing and can't be undone.
- A checkbox's or radio group's value is written as the checked widget's on-state name.
