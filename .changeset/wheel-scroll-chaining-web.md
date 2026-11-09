---
'@embedpdf/web': minor
---

The Stage's wheel handling asks the Stage whether a wheel is its own, through the host's new `wheelBy`, and cancels only the wheels the Stage takes. A wheel the Stage leaves alone reaches the browser, which scrolls the page around the viewer with it. A zoom wheel (Ctrl or Cmd) is always cancelled. A wheel event that isn't cancelable is ignored: the browser is already scrolling the page with it. A test that sends its own wheel events needs `cancelable: true` on them.
