---
'@embedpdf/plugin-form': patch
---

Fix Tab and Shift+Tab around a radio group that has another field between its buttons in the page's tab order. A radio group is one stop, where its first button comes, and its checked button takes the cursor. When the checked button came after another field, `focusNext()` and Tab went on from the button instead of from the group: Tab skipped the field between, and Shift+Tab went back and forth between that field and the group and never left. The cursor now goes on from the group's place, so each field is reached once in either direction, with `empty` and `wrap` too. A form whose radio buttons follow one another in the tab order behaves as before.
