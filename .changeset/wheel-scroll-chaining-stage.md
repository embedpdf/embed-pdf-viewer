---
'@embedpdf/plugin-stage': minor
---

A wheel or trackpad scroll over the Stage no longer gets stuck at the end of the pages. A scroll that begins where the pages can't scroll any further the way it pushes now scrolls the page around the viewer, as it does at the end of any scrolling element. A scroll that reaches the end stops there, momentum included, and the next one scrolls the page. On a trackpad the next swipe is the next one, also while the last still coasts. In paged flow a push past the edge still turns the page while there is one to turn to, and on a trackpad every swipe now turns one: a swipe that began while the last one still coasted turned nothing. The new `scrollChaining` setting is on by default. Set it to `false` in an app where the viewer fills the window, and the Stage keeps every wheel over it, as before: a sideways swipe the pages can't follow then never reaches the browser's back gesture.
