---
'@embedpdf/viewer-chrome': patch
---

- A click in a sheet or dialog that closes it and puts the cursor somewhere else, such as
  `form.focus()` from a panel of your own, leaves the cursor there instead of on the button that
  opened it.
- A floating bar with `hideWhileScrolling` hides after a click on one of its buttons too: only a bar
  you're using from the keyboard, or typing in, stays while the pages scroll.
