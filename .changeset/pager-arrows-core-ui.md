---
'@embedpdf/core-ui': minor
---

A floating bar's place takes `hideWhenIdle` (`FloatPlace`) in place of `hideWhileScrolling`, and `hideWhenIdleOf(data, id)` reads it in place of `hideWhileScrollingOf`, through the bar it rides along: the bar rests out of sight while nothing moves, instead of hiding while the pages scroll.
