---
'@embedpdf/plugin-stage': minor
---

`padding` takes `{ top, right, bottom, left }` beside one number, room for a toolbar floating over one edge. A change names only the sides it sets (`{ bottom: 56 }`) and the others are 0, as with `pageFrame`; `getSettings().padding` is what was given, with every side. The fit modes, the clamp, the scrollbars, arrivals and the wrapped grid's line width use each side, and a `'center'` or fractional placement shifts by half the difference between two sides, so equal sides place the content where they did.
