---
'@embedpdf/plugin-signature': minor
---

`placeMark(mark, { field })` on an image field (a push button) puts the mark in as its picture through the form plugin's `setButtonImage()`, whatever the mode: filling in, with the right to fill the field in, one step to undo. It never signs or asks, resolves `'filled'` and fires `onFilled`. An image field can be the target, as the form layer makes it on a press.

A mark armed from a `signatures` library and clicked over an image field the user fills in now goes into the field as its picture, in place of one it holds, and the tool disarms; before, it was placed as a stamp on the page. Over an image field that isn't theirs (read-only, another group's, or left out by the form's `fillable` setting) the click does nothing. Over any other push button, such as an icon-only action button, it is still placed as a stamp.
